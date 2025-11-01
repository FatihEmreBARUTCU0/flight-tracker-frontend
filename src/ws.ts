const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws";

let socket: WebSocket | null = null;
let retry = 0;

<<<<<<< HEAD
=======
// Global abonelik listesi
>>>>>>> aa198c6aa2d288c6b0e95f151c0fa5872ce8e92f
const subscribers = new Set<(ev: MessageEvent) => void>();

function notify(ev: MessageEvent) {
  for (const fn of subscribers) {
<<<<<<< HEAD
    try { fn(ev); } catch {  }
=======
    try { fn(ev); } catch { /* tek abonede hata diğerlerini etkilemesin */ }
>>>>>>> aa198c6aa2d288c6b0e95f151c0fa5872ce8e92f
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

export function connect() {
  if (socket && socket.readyState !== WebSocket.CLOSED) return socket;
  socket = new WebSocket(WS_URL);
  attach(socket);
  return socket;
}

<<<<<<< HEAD

=======
/** Mesaj aboneliği — unsubscribe fonksiyonu döner */
>>>>>>> aa198c6aa2d288c6b0e95f151c0fa5872ce8e92f
export function subscribe(handler: (ev: MessageEvent) => void) {
  subscribers.add(handler);
  return () => { subscribers.delete(handler); };
}

<<<<<<< HEAD

connect();


=======
// Modül yüklendiğinde ilk bağlantıyı başlat
connect();

// (opsiyonel) debug amaçlı dışarı aç
>>>>>>> aa198c6aa2d288c6b0e95f151c0fa5872ce8e92f
export function currentSocket() { return socket; }