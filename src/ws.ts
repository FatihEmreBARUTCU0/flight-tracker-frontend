// Basit WS istemcisi (isteğe göre geliştirilebilir)
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws";

// HMR sırasında çoğul bağlantıyı önlemek için global singleton
const g = globalThis as unknown as { __APP_WS__?: WebSocket };

if (!g.__APP_WS__ || g.__APP_WS__.readyState === WebSocket.CLOSED) {
  g.__APP_WS__ = new WebSocket(WS_URL);
  g.__APP_WS__.addEventListener("open", () => console.log("[ws] connected:", WS_URL));
  g.__APP_WS__.addEventListener("close", () => console.log("[ws] closed"));
}

export default g.__APP_WS__!;
