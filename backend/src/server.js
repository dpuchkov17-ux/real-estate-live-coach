// backend/src/server.js

import http from "http";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { WebSocketServer } from "ws";

import { getSession } from "./sessions.js";
import { computeNextSuggestion, applyQueuedAdvance } from "./coachEngine.js";
import { attachWebSocketServer, broadcastToCall } from "./ws.js";

const PUBLIC_HOST = process.env.PUBLIC_HOST || "render-statements-bibliographic-licensed.trycloudflare.com";


const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "real-estate-live-coach-backend" });
});

app.post("/voice", (req, res) => {
  const callSid = req.body?.CallSid || "unknown";
  const wsUrl = `wss://${PUBLIC_HOST}/ws?callId=${encodeURIComponent(callSid)}`;

  res.status(200);
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Call connected. Live coach is starting.</Say>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`);
});


/**
 * Ingest transcript events (from Twilio pipeline or your own STT layer).
 * IMPORTANT: This endpoint accepts TEXT only.
 */
app.post("/twilio/transcript", (req, res) => {
  const { callId, ts, speaker, text, confidence } = req.body || {};

  if (!callId || !speaker || !text) {
    return res.status(400).json({ ok: false, error: "callId, speaker, text are required" });
  }

  const session = getSession(callId);
  const turn = {
    ts: ts || Date.now(),
    speaker,
    text,
    confidence: typeof confidence === "number" ? confidence : null,
  };

  session.transcript.push(turn);

  // Broadcast transcript to UI
  broadcastToCall(callId, { type: "transcript", payload: turn });

  res.json({ ok: true });
});

/**
 * UI calls this ONLY after it rendered the transcript on screen.
 * This enforces: "AI only gets the text that was on screen."
 */
app.post("/coach/analyze", async (req, res) => {
  const { callId, displayedTurns, now, action } = req.body || {};

  if (!callId || !Array.isArray(displayedTurns)) {
    return res.status(400).json({ ok: false, error: "callId and displayedTurns[] required" });
  }

  const session = getSession(callId);

  // Optional action: if UI says "advance now" after hold time, apply queued advance.
  if (action === "applyQueuedAdvance") {
    applyQueuedAdvance(session);
  }

  const suggestion = await computeNextSuggestion({
    session,
    displayedTurns,
    now: typeof now === "number" ? now : Date.now(),
  });

  // Broadcast coach suggestion to UI
  broadcastToCall(callId, { type: "coach", payload: suggestion });

  res.json({ ok: true, suggestion });
});

// Create HTTP server + attach WS
const server = http.createServer(app);
attachWebSocketServer({ httpServer: server, WebSocketServer });

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws?callId=YOUR_CALL_ID`);
});
