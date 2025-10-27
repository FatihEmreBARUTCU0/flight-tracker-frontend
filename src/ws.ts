// src/ws.ts
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws";

const ws = new WebSocket(WS_URL);

// basit loglar (istemiyorsan silebilirsin)
ws.onopen = () => console.log("[ws] connected:", WS_URL);
ws.onclose = () => console.log("[ws] disconnected");
ws.onerror = (e) => console.error("[ws] error:", e);

export default ws;
