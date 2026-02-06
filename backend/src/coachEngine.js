// backend/src/coachEngine.js

import { KEY_QUESTIONS, OBJECTION_BANK, END_CALL_PHRASE, CONTINUE_PHRASE } from "./banks.js";
import { classifyDisplayedTurns } from "./ai.js";

/**
 * Strict coach flow engine.
 * Input: session + displayedTurns (ONLY what UI confirmed was shown on screen)
 * Output: next suggestion payload to send to UI
 */

// Section order for advancing
const SECTION_ORDER = ["S1", "S2", "S3"];

function getKeyList(section) {
  return KEY_QUESTIONS[section] || [];
}

function getCurrentKeyQuestion(session) {
  const list = getKeyList(session.section);
  const item = list[session.keyIndex];
  return item || null;
}

function getNextKeyQuestion(session) {
  const list = getKeyList(session.section);
  const nextIndex = session.keyIndex + 1;

  // If still within section
  if (nextIndex < list.length) {
    return { section: session.section, keyIndex: nextIndex, item: list[nextIndex] };
  }

  // Move to next section if exists
  const currentSectionIdx = SECTION_ORDER.indexOf(session.section);
  const nextSection = SECTION_ORDER[currentSectionIdx + 1];

  if (nextSection) {
    const nextList = getKeyList(nextSection);
    if (nextList.length > 0) {
      return { section: nextSection, keyIndex: 0, item: nextList[0] };
    }
  }

  // End of script: keep last question (MVP behavior)
  return { section: session.section, keyIndex: session.keyIndex, item: getCurrentKeyQuestion(session) };
}

function pickObjectionLines(category) {
  const bank = OBJECTION_BANK[category];
  if (!bank || bank.length === 0) return null;
  return {
    prompt: bank[0],
    alternatives: bank.slice(1, 3),
  };
}

/**
 * Rule: explicit end-call intent twice in a row (allow max 1 objection between).
 * We track:
 * - endCallIntentStreak: 0/1/2
 * - endIntentGrace: boolean (true after 1st intent; allows 1 objection between)
 */
function updateEndIntentTracking(session, ai) {
  // ai.endIntent is boolean classification from the prospect’s last turn
  if (ai.endIntent) {
    session.endCallIntentStreak = (session.endCallIntentStreak || 0) + 1;
    session.endIntentGrace = true; // allow at most one objection between intents
    return;
  }

  // If no end intent now:
  // - If we just used an objection while grace is true, keep streak (still allowed)
  // - Otherwise reset
  if (session.endIntentGrace && session.mode === "objection") {
    // keep as-is, but consume grace after one objection
    session.endIntentGrace = false;
    return;
  }

  session.endCallIntentStreak = 0;
  session.endIntentGrace = false;
}

function shouldEndCall(session) {
  if ((session.endCallIntentStreak || 0) >= 2) return { yes: true, reason: "prospect_end_intent_twice" };
  if ((session.objectionStreak || 0) >= 3) return { yes: true, reason: "three_objections_failed" };
  return { yes: false, reason: null };
}

/**
 * Main engine entrypoint
 */
export async function computeNextSuggestion({ session, displayedTurns, now = Date.now() }) {
  // Save what UI displayed (the rule: only displayed text is eligible for AI)
  session.displayedTranscript = displayedTurns;

  // If we have a pending advance time, we do NOT advance until it passes.
  // This enforces the "keep key question for 2 seconds after positive/neutral" rule.
  if (session.pendingAdvanceAt && now < session.pendingAdvanceAt) {
    const current = getCurrentKeyQuestion(session);
    return {
      mode: session.mode,
      promptId: session.currentPromptId,
      prompt: current?.text || "",
      holdMsRemaining: session.pendingAdvanceAt - now,
      shouldEndCall: false,
      note: "holding_before_advance",
    };
  }

  // Clear pending hold once time passed
  session.pendingAdvanceAt = null;

  // Ask AI to classify the current displayed turns (rails only)
  const ai = await classifyDisplayedTurns({
    displayedTurns,
    currentPromptId: session.currentPromptId,
    mode: session.mode,
  });
  // ai expected shape:
  // {
  //   reaction: "positive" | "neutral" | "negative",
  //   objectionCategory: "price" | "timing" | "spouse" | ... | null,
  //   endIntent: boolean,
  //   objectionResolved: boolean, // optional but useful
  //   confidence: 0..1
  // }

  // Update end-intent tracking first (highest priority)
  updateEndIntentTracking(session, ai);

  // Hard end-call rules
  const end = shouldEndCall(session);
  if (end.yes) {
    session.mode = "end_call";
    return {
      mode: "end_call",
      promptId: "END_CALL",
      prompt: END_CALL_PHRASE,
      shouldEndCall: true,
      reason: end.reason,
      confidence: ai.confidence ?? 0.5,
    };
  }

  // If we were in objection mode and AI says it got resolved,
  // we ask for permission to continue and then return to key question.
  if (session.mode === "objection" && ai.objectionResolved) {
    session.objectionStreak = 0; // reset streak because it worked
    session.mode = "key_question";
    // Do NOT advance key question here — we return to the SAME key question.
    const current = getCurrentKeyQuestion(session);
    return {
      mode: "key_question",
      promptId: session.currentPromptId,
      prompt: current?.text || "",
      preface: CONTINUE_PHRASE,
      shouldEndCall: false,
      confidence: ai.confidence ?? 0.5,
      note: "objection_resolved_return_to_same_key_question",
    };
  }

  // If reaction is negative → objection mode
  if (ai.reaction === "negative") {
    session.mode = "objection";
    session.objectionStreak = (session.objectionStreak || 0) + 1;

    // Re-check end-call after incrementing objection streak
    const end2 = shouldEndCall(session);
    if (end2.yes) {
      session.mode = "end_call";
      return {
        mode: "end_call",
        promptId: "END_CALL",
        prompt: END_CALL_PHRASE,
        shouldEndCall: true,
        reason: end2.reason,
        confidence: ai.confidence ?? 0.5,
      };
    }

    const category = ai.objectionCategory || "not_interested";
    const lines = pickObjectionLines(category);

    if (lines) {
      return {
        mode: "objection",
        promptId: `OBJ_${category}_${session.objectionStreak}`,
        objectionCategory: category,
        prompt: lines.prompt,
        alternatives: lines.alternatives,
        shouldEndCall: false,
        confidence: ai.confidence ?? 0.5,
      };
    }

    // If no bank match, AI should provide fallback line (later).
    // For MVP, use a safe generic objection line.
    return {
      mode: "objection",
      promptId: `OBJ_unknown_${session.objectionStreak}`,
      objectionCategory: "unknown",
      prompt: "Understood. What specifically is making this a no right now—price, timing, or fit?",
      alternatives: [],
      shouldEndCall: false,
      confidence: ai.confidence ?? 0.5,
    };
  }

  // Positive/neutral → continue key questions
  // Reset objection streak because we’re not in objection loop
  session.objectionStreak = 0;
  session.mode = "key_question";

  const current = getCurrentKeyQuestion(session);

  // If we don't have a current prompt yet, start at current key question
  if (!session.currentPromptId || !current) {
    const first = getCurrentKeyQuestion(session) || getKeyList(session.section)[0] || null;
    if (first) {
      session.currentPromptId = first.id;
      return {
        mode: "key_question",
        promptId: first.id,
        prompt: first.text,
        shouldEndCall: false,
        confidence: ai.confidence ?? 0.5,
        note: "start_or_recover_key_question",
      };
    }
  }

  // Advance to next key question, but enforce 2s hold before actually switching
  const next = getNextKeyQuestion(session);

  // Set pending hold: keep showing current prompt for 2 seconds
  session.pendingAdvanceAt = now + 2000;

  // Also store what will be next, so the UI can show "up next" if desired
  session.nextQueued = { section: next.section, keyIndex: next.keyIndex, id: next.item?.id, text: next.item?.text };

  // We return current prompt now (hold). UI will call analyze again after 2 seconds.
  return {
    mode: "key_question",
    promptId: session.currentPromptId,
    prompt: current?.text || "",
    shouldEndCall: false,
    confidence: ai.confidence ?? 0.5,
    delayMs: 2000,
    queuedNext: session.nextQueued,
    note: "holding_then_advance",
  };
}

/**
 * Call this when the UI confirms the 2s hold passed and wants to switch.
 * (Optional helper if you want an explicit endpoint later.)
 */
export function applyQueuedAdvance(session) {
  if (!session.nextQueued) return;

  session.section = session.nextQueued.section;
  session.keyIndex = session.nextQueued.keyIndex;
  session.currentPromptId = session.nextQueued.id || session.currentPromptId;
  session.nextQueued = null;
}
