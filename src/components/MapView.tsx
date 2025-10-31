// frontend/src/components/MapView.tsx
import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";
import ws from "../ws";
import "leaflet/dist/leaflet.css";
import { toLL, bearing } from "../lib/geo";

type Flight = {
  _id: string;
  flightCode: string;
  departure_lat: number;
  departure_long: number;
  destination_lat: number;
  destination_long: number;
  departureTime: string;
};

type Props = { mode: "live" | "replay"; at: number; onRangeChange?: (r: { min: number; max: number } | null) => void; };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const CENTER: LatLngExpression = toLL(41.0082, 28.9784);

export default function MapView({ mode, at, onRangeChange }: Props) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [pos, setPos] = useState<Record<string, { lat: number; lng: number; ts: number }>>({});
  const [prevPos, setPrevPos] = useState<Record<string, { lat: number; lng: number }>>({});
  // replay konumu + yön
  const [replayPos, setReplayPos] = useState<Record<string, { lat: number; lng: number; ang: number }>>({});

  // ikon cache (derece → icon)
  const iconCache = useRef<Map<number, L.DivIcon>>(new Map());
  const getIcon = useCallback((deg: number) => {
    const d = Math.round(deg);
    let icon = iconCache.current.get(d);
    if (!icon) {
      icon = L.divIcon({
        html: `<div style="font-size:22px; transform: rotate(${d}deg); line-height:1">✈️</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        className: "plane-icon",
      });
      iconCache.current.set(d, icon);
    }
    return icon;
  }, []);

  // 1) uçuşları çek
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/flights`);
        const list = await r.json();
        if (!cancelled && Array.isArray(list)) setFlights(list);
      } catch (e) {
        console.error("[/flights] error", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (mode !== "replay" || flights.length === 0) {
      onRangeChange?.(null);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const nowIso = new Date().toISOString();
        const results = await Promise.all(
          flights.map(async (f) => {
            // ilk kayıt
            const r1 = await fetch(
              `${API_URL}/telemetry?flightId=${encodeURIComponent(f._id)}&limit=1&sort=asc`,
              { signal: ctrl.signal }
            );
            const first = (await r1.json().catch(() => []))?.[0];

            // son kayıt (şu ana kadar)
            const r2 = await fetch(
              `${API_URL}/telemetry/latest?flightId=${encodeURIComponent(f._id)}&at=${encodeURIComponent(nowIso)}`,
              { signal: ctrl.signal }
            );
            const last = await r2.json().catch(() => undefined);

            const t0 = first?.ts ? new Date(first.ts).getTime() : undefined;
            const t1 = last?.ts ? new Date(last.ts).getTime() : undefined;
            return [t0, t1] as const;
          })
        );

        let min = Infinity, max = -Infinity;
        for (const [t0, t1] of results) {
          if (typeof t0 === "number") min = Math.min(min, t0);
          if (typeof t1 === "number") max = Math.max(max, t1);
        }
        if (isFinite(min) && isFinite(max)) {
          // küçük tampon ekle (±30 sn)
          onRangeChange?.({ min: min - 30_000, max: max + 30_000 });
        }
      } catch {
        // sessizce geç
      }
    })();
    return () => ctrl.abort();
  }, [mode, flights, onRangeChange]);

  // 2) WS (canlı telemetri + yeni uçuşlar)
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg?.type === "flight.created" && msg.flight) {
          setFlights((prev) => (prev.some((f) => f._id === msg.flight._id) ? prev : [...prev, msg.flight]));
        }

        if (msg?.type === "telemetry") {
          const { flightId, lat, lng, ts } = msg;
          setPos((prev) => {
            const last = prev[flightId];
            setPrevPos((p) => ({ ...p, [flightId]: last ? { lat: last.lat, lng: last.lng } : { lat, lng } }));
            return { ...prev, [flightId]: { lat, lng, ts } };
          });
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, []);

  // 3) Replay: at zamanına karşılık gelen nokta (prev/next + interpolasyon) + yön
  useEffect(() => {
    if (mode !== "replay" || flights.length === 0) {
      setReplayPos({});
      return;
    }

    const debounceMs = 150;
    const ctrl = new AbortController();
    const iso = new Date(at).toISOString();
    const MAX_GAP_MS = 120_000; // 2 dk: bu süreden uzun aralarda interpolasyon yapma
    const atMs = at;

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

    async function getPointAt(f: Flight, signal: AbortSignal) {
      try {
        // ≤ at olan son nokta
        const r1 = await fetch(
          `${API_URL}/telemetry/latest?flightId=${encodeURIComponent(f._id)}&at=${encodeURIComponent(iso)}`,
          { signal }
        );
        const prev = await r1.json().catch(() => undefined);

        // ≥ at olan ilk nokta
        const r2 = await fetch(
          `${API_URL}/telemetry?flightId=${encodeURIComponent(f._id)}&from=${encodeURIComponent(iso)}&limit=1&sort=asc`,
          { signal }
        );
        const list = await r2.json().catch(() => undefined);
        const next = Array.isArray(list) ? list[0] : undefined;

        // iki uç da varsa
        if (prev && next && prev.ts && next.ts) {
          const t0 = new Date(prev.ts).getTime();
          const t1 = new Date(next.ts).getTime();
          const gap = t1 - t0;
          // GAP büyükse: interpolasyon yapma, prev'de bekle
          if (gap > MAX_GAP_MS) {
            const angHold = bearing(
              { lat: f.departure_lat, lng: f.departure_long },
              { lat: prev.lat, lng: prev.lng }
            );
            return { lat: prev.lat, lng: prev.lng, ang: angHold };
          }
          // GAP küçükse: lineer interpolasyon
          const span = Math.max(1, gap);
          const t = Math.min(1, Math.max(0, (atMs - t0) / span));
          const lat = lerp(prev.lat, next.lat, t);
          const lng = lerp(prev.lng, next.lng, t);
          const ang = bearing({ lat: prev.lat, lng: prev.lng }, { lat: next.lat, lng: next.lng });
          return { lat, lng, ang };
        }

        // yalnızca PREV varsa: prev'de bekle
        if (prev && typeof prev.lat === "number" && typeof prev.lng === "number") {
          const ang = bearing(
            { lat: f.departure_lat, lng: f.departure_long },
            { lat: prev.lat, lng: prev.lng }
          );
          return { lat: prev.lat, lng: prev.lng, ang };
        }
        // yalnızca NEXT varsa: kalkış noktasında bekle (uçağı erken göstermeyelim)
        if (next && typeof next.lat === "number" && typeof next.lng === "number") {
          const ang = bearing(
            { lat: f.departure_lat, lng: f.departure_long },
            { lat: next.lat, lng: next.lng }
          );
          return { lat: f.departure_lat, lng: f.departure_long, ang };
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("[/telemetry pointAt] error", e);
      }
      return undefined;
    }

    const t = setTimeout(async () => {
      try {
        const entries = await Promise.all(
          flights.map(async (f) => [f._id, await getPointAt(f, ctrl.signal)] as const)
        );
        const map: Record<string, { lat: number; lng: number; ang: number }> = {};
        for (const [id, p] of entries) {
          if (p) map[id] = p;
        }
        setReplayPos(map);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("[/telemetry nearest] error", e);
      }
    }, debounceMs);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mode, at, flights]);

  return (
    <MapContainer center={CENTER} zoom={7} className="fullscreen-map" preferCanvas>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {flights.map((f) => {
        const start = { lat: f.departure_lat, lng: f.departure_long };
        const end = { lat: f.destination_lat, lng: f.destination_long };

        const liveP = pos[f._id];              // canlıdan gelen son nokta
        const prevLiveP = prevPos[f._id] ?? start;
        const replP = replayPos[f._id];        // replay sorgusundan gelen (lat,lng,ang)

        // gösterilecek nokta (lat,lng)
        const pLive = liveP ? { lat: liveP.lat, lng: liveP.lng } : undefined;
        const pReplay = replP ? { lat: replP.lat, lng: replP.lng } : undefined;
        const p = mode === "replay" ? pReplay : pLive;

        // yön (bearing)
        let ang: number;
        if (mode === "replay") {
          ang = replP?.ang ?? bearing(start, end);
        } else {
          ang = liveP ? bearing(prevLiveP, { lat: liveP.lat, lng: liveP.lng }) : bearing(start, end);
        }

        const planeIcon = getIcon(ang);

        return (
          <Fragment key={f._id}>
            <Polyline
              positions={[toLL(start.lat, start.lng), toLL(end.lat, end.lng)]}
              pathOptions={{ dashArray: "6 8", weight: 2 }}
            />
            <CircleMarker center={toLL(start.lat, start.lng)} radius={6} pathOptions={{ color: "green" }} />
            <CircleMarker center={toLL(end.lat, end.lng)} radius={6} pathOptions={{ color: "red" }} />

            {p && (
              <Marker position={toLL(p.lat, p.lng)} icon={planeIcon}>
                <Popup>
                  <b>{f.flightCode}</b>
                  <br />
                  ID: {f._id}
                  <br />
                  Kalkış: {start.lat.toFixed(3)}, {start.lng.toFixed(3)}
                  <br />
                  Varış: {end.lat.toFixed(3)}, {end.lng.toFixed(3)}
                  <br />
                  Kalkış Zamanı: {new Date(f.departureTime).toLocaleString()}
                  <br />
                  Görüntülenen Konum: {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                </Popup>
              </Marker>
            )}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
