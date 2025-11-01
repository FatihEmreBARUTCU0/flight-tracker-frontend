import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup } from "react-leaflet";
import L, { type LatLngExpression } from "leaflet";

import "leaflet/dist/leaflet.css";
import { toLL, bearing } from "../lib/geo";
import { subscribe } from "../ws";
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

  // 2) Replay aralığı: TEK istekle /telemetry/window
  useEffect(() => {
    if (mode !== "replay" || flights.length === 0) {
      onRangeChange?.(null);
      return;
    }
    const ctrl = new AbortController();

    (async () => {
      try {
        const ids = flights.map((f) => f._id).join(",");
        const nowIso = new Date().toISOString();
        const url = `${API_URL}/telemetry/window?flightIds=${encodeURIComponent(ids)}&at=${encodeURIComponent(nowIso)}`;
        const r = await fetch(url, { signal: ctrl.signal });
        const j = await r.json().catch(() => ({} as any));

        // Beklenen şema: { global: { min, max } }
        const g = (j && typeof j === "object") ? (j as any).global : undefined;
        const minVal = g?.min ?? (j as any)?.min;
        const maxVal = g?.max ?? (j as any)?.max;

        if (minVal && maxVal) {
          const minMs = typeof minVal === "number" ? minVal : new Date(minVal).getTime();
          const maxMs = typeof maxVal === "number" ? maxVal : new Date(maxVal).getTime();
          if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
            onRangeChange?.({ min: minMs - 30_000, max: maxMs + 30_000 }); // ±30 sn tampon
          }
        }
      } catch {
        /* sessizce geç */
      }
    })();

    return () => ctrl.abort();
  }, [mode, flights, onRangeChange]);

  // 3) WS (canlı telemetri + yeni uçuşlar)
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);

        if (msg?.type === "flight.created" && msg.flight) {
          setFlights((prev) =>
            prev.some((f) => f._id === msg.flight._id) ? prev : [...prev, msg.flight]
          );
        }

        if (msg?.type === "telemetry") {
          const { flightId, lat, lng, ts } = msg;
          setPos((prev) => {
            const last = prev[flightId];
            setPrevPos((p) => ({
              ...p,
              [flightId]: last ? { lat: last.lat, lng: last.lng } : { lat, lng },
            }));
            return { ...prev, [flightId]: { lat, lng, ts } };
          });
        }
      } catch {
        /* ignore */
      }
    };

    const unsubscribe = subscribe(onMessage);
    return () => unsubscribe();
  }, []);

  // 4) Replay: tek backend çağrısı ile prev/next toplu; client-side interpolasyon
  useEffect(() => {
    if (mode !== "replay" || flights.length === 0) {
      setReplayPos({});
      return;
    }

    const ctrl = new AbortController();
    const debounceMs = 450;
    const atIso = new Date(at).toISOString();
    const MAX_GAP_MS = 120_000;

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

    const tmr = setTimeout(async () => {
      try {
        const ids = flights.map(f => f._id).join(",");
        const r = await fetch(
          `${API_URL}/telemetry/nearest?flightIds=${encodeURIComponent(ids)}&at=${encodeURIComponent(atIso)}`,
          { signal: ctrl.signal }
        );
        const map = await r.json(); // { [flightId]: { prev?: {lat,lng,ts}, next?: {lat,lng,ts} } }

        const nextState: Record<string, { lat: number; lng: number; ang: number }> = {};

        for (const f of flights) {
          const pair = map?.[f._id];
          const start = { lat: f.departure_lat, lng: f.departure_long };

          const prev = pair?.prev ? { ...pair.prev, t: new Date(pair.prev.ts).getTime() } : null;
          const next = pair?.next ? { ...pair.next, t: new Date(pair.next.ts).getTime() } : null;

          if (prev && next) {
            const gap = next.t - prev.t;
            if (gap > MAX_GAP_MS) {
              const angHold = bearing(start, { lat: prev.lat, lng: prev.lng });
              nextState[f._id] = { lat: prev.lat, lng: prev.lng, ang: angHold };
            } else {
              const span = Math.max(1, gap);
              const t = Math.min(1, Math.max(0, (at - prev.t) / span));
              const lat = lerp(prev.lat, next.lat, t);
              const lng = lerp(prev.lng, next.lng, t);
              const ang = bearing({ lat: prev.lat, lng: prev.lng }, { lat: next.lat, lng: next.lng });
              nextState[f._id] = { lat, lng, ang };
            }
            continue;
          }

          if (prev) {
            const ang = bearing(start, { lat: prev.lat, lng: prev.lng });
            nextState[f._id] = { lat: prev.lat, lng: prev.lng, ang };
            continue;
          }

          if (next) {
            const ang = bearing(start, { lat: next.lat, lng: next.lng });
            nextState[f._id] = { lat: f.departure_lat, lng: f.departure_long, ang };
          }
        }

        setReplayPos(nextState);
      } catch (e: any) {
        if (e?.name !== "AbortError") console.error("[/telemetry/nearest] error", e);
      }
    }, debounceMs);

    return () => { clearTimeout(tmr); ctrl.abort(); };
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
