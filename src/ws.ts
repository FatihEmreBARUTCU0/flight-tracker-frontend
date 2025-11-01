// src/ws.ts
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws";

let socket: WebSocket | null = null;
let retry = 0;

const subscribers = new Set<(ev: MessageEvent) => void>();

function notify(ev: MessageEvent) {
  for (const fn of subscribers) {
    try { fn(ev); } catch { /* tek abonede hata diğerlerini etkilemesin */ }
  }
}

function attach(ws: WebSocket) {
  ws.addEventListener("message", notify);
  ws.addEventListener("open", () => {
    retry = 0;
    console.log("[ws] connected:", WS_URL);
  });
  ws.addEventListener("close", () => {
    console.log("[ws] closed");
    const delay = Math.min(1000 * 2 ** retry + Math.random() * 200, 15000);
    retry++;
    setTimeout(connect, delay);
  });
  ws.addEventListener("error", () => {
    try { ws.close(); } catch {}
  });
}

export function connect(): WebSocket {
  if (socket && socket.readyState !== WebSocket.CLOSED) return socket;
  socket = new WebSocket(WS_URL);
  attach(socket);
  return socket;
}

export function subscribe(handler: (ev: MessageEvent) => void): () => void {
  subscribers.add(handler);
  return () => { subscribers.delete(handler); };
}

// Modül yüklendiğinde bağlan
connect();

export function currentSocket(): WebSocket | null { return socket; }
