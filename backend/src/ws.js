// backend/src/ws.js

/**
 * WebSocket broker for per-call streaming.
 * - UI connects with ?callId=...
 * - We broadcast transcript + coach events to all listeners of that callId.
 */

const callSockets = new Map(); // callId -> Set<WebSocket>

function getCallSet(callId) {
  if (!callSockets.has(callId)) callSockets.set(callId, new Set());
  return callSockets.get(callId);
}

export function attachWebSocketServer({ httpServer, WebSocketServer }) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const callId = url.searchParams.get("callId") || "default";

      const set = getCallSet(callId);
      set.add(ws);

      ws.send(
        JSON.stringify({
          type: "system",
          payload: { message: "connected", callId },
        })
      );

      ws.on("close", () => {
        set.delete(ws);
        if (set.size === 0) callSockets.delete(callId);
      });

      ws.on("error", () => {
        set.delete(ws);
      });

      // Optional: allow UI to ping
      ws.on("message", (msg) => {
        // ignore for now, or handle ping/pong messages
        // console.log("ws message", msg.toString());
      });
    } catch (err) {
      // If something weird happens, close the socket safely
      try {
        ws.close();
      } catch {}
    }
  });

  return wss;
}

export function broadcastToCall(callId, event) {
  const set = callSockets.get(callId);
  if (!set || set.size === 0) return;

  const data = JSON.stringify(event);
  for (const ws of set) {
    try {
      if (ws.readyState === 1) ws.send(data); // 1 = OPEN
    } catch {
      // ignore send errors
    }
  }
}
