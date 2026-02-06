// backend/src/sessions.js

/**
 * In-memory session store (MVP).
 * One session = one live call.
 * Later can be replaced by Redis.
 */

const sessions = new Map();

export function getSession(callId) {
  if (!sessions.has(callId)) {
    sessions.set(callId, {
      callId,

      // Full transcript (raw, ordered)
      transcript: [],

      // Only the text that the UI confirms was displayed
      displayedTranscript: [],

      // Flow control
      section: "S1",              // S1, S2, S3...
      keyIndex: 0,                // index inside key questions
      mode: "key_question",       // key_question | objection | end_call

      // Counters (strict logic)
      objectionStreak: 0,
      endCallIntentStreak: 0,

      // State helpers
      currentPromptId: null,
      lastProspectReaction: "neutral",
      lastPromptAt: Date.now(),
    });
  }

  return sessions.get(callId);
}

export function resetSession(callId) {
  sessions.delete(callId);
}
