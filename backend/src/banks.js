// backend/src/banks.js

/**
 * CONTENT BANKS (MVP)
 * - Key questions are ordered and grouped by section.
 * - Objection responses are grouped by category.
 * The coach engine always tries these banks first before any AI improvisation.
 */

// Ordered key questions by section.
// Keep these short and "usable in real calls".
export const KEY_QUESTIONS = {
  S1: [
    { id: "S1Q1", text: "Quickly—what triggered the move right now?" },
    { id: "S1Q2", text: "What would make this conversation a win for you?" },
    { id: "S1Q3", text: "When do you ideally want to be in the new place?" },
    { id: "S1Q4", text: "What’s not working with your current situation?" },
  ],
  S2: [
    { id: "S2Q1", text: "What price range feels comfortable—not optimistic?" },
    { id: "S2Q2", text: "Cash or financing—are you already pre-approved?" },
    { id: "S2Q3", text: "Top 3 must-haves? And top 3 dealbreakers?" },
    { id: "S2Q4", text: "If we found the right option, what could still stop you from moving forward?" },
  ],
  S3: [
    { id: "S3Q1", text: "If we schedule a showing, what day/time is easiest this week?" },
    { id: "S3Q2", text: "Who else needs to be involved in the decision?" },
    { id: "S3Q3", text: "What would you need to see to feel confident saying yes after the showing?" },
  ],
};

// Objection response bank by category.
// The first item is the default "best move", next items are alternatives.
export const OBJECTION_BANK = {
  price: [
    "Totally fair — compared to what?",
    "If we keep the price, what would need to improve to make it a yes?",
    "If we keep the features, what price would feel right?",
  ],
  timing: [
    "What’s driving the timing — what changes if you wait?",
    "If it were a perfect fit, what would be the earliest you could move?",
    "What would need to happen for timing to feel right?",
  ],
  spouse: [
    "Makes sense. What matters most to them?",
    "Want a quick 3-way call so we don’t play telephone?",
    "If they said yes today, would you be ready to move forward?",
  ],
  trust: [
    "Fair question. What would help you feel confident this is the right move?",
    "What’s your biggest concern — price, process, or risk?",
    "Would a written breakdown of options + comps help?",
  ],
  already_working_with_agent: [
    "Got it. Are you under an exclusive agreement right now?",
    "If not exclusive—what would you want differently from the experience you’re having?",
    "Would it be useful if I shared a few off-market/alternative options to compare?",
  ],
  not_interested: [
    "Understood. Is it a 'not now' or a 'not this'?",
    "What specifically makes it a no—price, timing, or fit?",
    "If one thing changed, what would make you reconsider?",
  ],
};

// Used when logic says: end call or de-escalate.
export const END_CALL_PHRASE =
  "I hear you. Let’s not force it — I’ll send a short recap, and if timing changes, you can reach back out.";

// Used after an objection "works" and you need permission to continue.
export const CONTINUE_PHRASE =
  "Got it. Does that address it enough for us to continue?";
