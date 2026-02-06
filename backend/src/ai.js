// backend/src/ai.js

/**
 * RAILS-ONLY AI CLASSIFIER (MVP)
 *
 * This module is NOT allowed to decide the flow.
 * It only returns signals:
 * - reaction: positive | neutral | negative
 * - objectionCategory: string | null
 * - endIntent: boolean
 * - objectionResolved: boolean
 *
 * Later: replace internals with a server-side LLM call that returns strict JSON.
 */

const END_INTENT_PHRASES = [
  "stop calling",
  "don't call me",
  "do not call me",
  "remove me",
  "take me off",
  "unsubscribe",
  "end the call",
  "hang up",
  "not interested",
  "leave me alone",
];

const POSITIVE_PHRASES = [
  "sounds good",
  "that works",
  "ok",
  "okay",
  "yes",
  "yeah",
  "sure",
  "great",
  "perfect",
];

const NEGATIVE_PHRASES = [
  "no",
  "not really",
  "don't",
  "do not",
  "can't",
  "cannot",
  "won't",
  "will not",
  "too expensive",
  "too much",
  "not interested",
];

const OBJECTION_KEYWORDS = [
  { category: "price", words: ["price", "expensive", "too much", "cost", "afford"] },
  { category: "timing", words: ["not now", "later", "timing", "wait", "next month", "next year"] },
  { category: "spouse", words: ["spouse", "husband", "wife", "partner", "talk to", "ask my"] },
  { category: "trust", words: ["scam", "trust", "not sure", "skeptical", "legit", "legitimate"] },
  { category: "already_working_with_agent", words: ["already have an agent", "my agent", "realtor", "broker"] },
  { category: "not_interested", words: ["not interested", "no thanks", "stop", "leave me alone"] },
];

/**
 * Helper to safely normalize text
 */
function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function includesAny(text, phrases) {
  return phrases.some((p) => text.includes(p));
}

function detectObjectionCategory(text) {
  for (const item of OBJECTION_KEYWORDS) {
    if (item.words.some((w) => text.includes(w))) return item.category;
  }
  return null;
}

/**
 * Very simple heuristic:
 * - If prospect says "ok / sounds good / yes" after objection handling -> resolved
 * - If prospect repeats the same objection keywords -> not resolved
 *
 * Later we’ll do this via LLM + structured state.
 */
function detectObjectionResolved({ lastProspectText, mode }) {
  if (mode !== "objection") return false;
  if (!lastProspectText) return false;

  // "Yes/ok" after objection suggests it worked
  if (includesAny(lastProspectText, POSITIVE_PHRASES)) return true;

  // Strong negatives suggest it didn't work
  if (includesAny(lastProspectText, ["still", "no", "not", "doesn't", "does not"])) return false;

  // Default: unknown -> false
  return false;
}

/**
 * Main classifier used by coachEngine.js
 */
export async function classifyDisplayedTurns({ displayedTurns, currentPromptId, mode }) {
  // Find last prospect turn
  const lastProspect = [...(displayedTurns || [])].reverse().find((t) => t.speaker === "prospect");
  const lastProspectText = norm(lastProspect?.text);

  const endIntent = lastProspectText ? includesAny(lastProspectText, END_INTENT_PHRASES) : false;

  const objectionCategory = lastProspectText ? detectObjectionCategory(lastProspectText) : null;

  // Reaction (very MVP)
  let reaction = "neutral";
  if (lastProspectText) {
    if (includesAny(lastProspectText, POSITIVE_PHRASES)) reaction = "positive";
    if (includesAny(lastProspectText, NEGATIVE_PHRASES)) reaction = "negative";
  }

  // If end intent is detected, treat reaction as negative (it is a hard stop)
  if (endIntent) reaction = "negative";

  const objectionResolved = detectObjectionResolved({ lastProspectText, mode });

  // Confidence is a placeholder — later will come from LLM probabilities or rules weighting.
  const confidence = 0.55;

  return {
    reaction,
    objectionCategory,
    endIntent,
    objectionResolved,
    confidence,
    debug: {
      currentPromptId,
      mode,
      lastProspectText,
    },
  };
}
