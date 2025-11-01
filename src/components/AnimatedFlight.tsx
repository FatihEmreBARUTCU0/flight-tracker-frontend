import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { toLL, lerp, bearing } from "../lib/geo";

export type Flight = {
  _id: string;
  flightCode: string;
  departure_lat: number;
  departure_long: number;
  destination_lat: number;
  destination_long: number;
  departureTime: string;
};

type Props = {
  flight: Flight;
 
  speedKmh?: number;   
  loop?: boolean;     
};


function interpolate(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number
) {
  return {
    lat: lerp(a.lat, b.lat, t),
    lng: lerp(a.lng, b.lng, t),
  };
}


function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

export default function AnimatedFlight({ flight, speedKmh = 450, loop = true }: Props) {
  const start = { lat: flight.departure_lat, lng: flight.departure_long };
  const end = { lat: flight.destination_lat, lng: flight.destination_long };
  const [t, setT] = useState(0); 
  const rafRef = useRef<number | null>(null);


  const durationMs = useMemo(() => {
    const distKm = haversineKm(start, end);
    const hours = distKm / speedKmh;
    return Math.max(3000, hours * 3600 * 1000); 
  }, [start.lat, start.lng, end.lat, end.lng, speedKmh]);

  useEffect(() => {
    let mounted = true;
    const t0 = performance.now();

    const tick = (now: number) => {
      if (!mounted) return;
      const nt = Math.min(1, (now - t0) / durationMs);
      setT(nt);
      if (nt < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else if (loop) {
        
        setTimeout(() => {
          if (!mounted) return;
          setT(0);
          rafRef.current = requestAnimationFrame((n) => tick(n));
        }, 600);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [durationMs, loop, start.lat, start.lng, end.lat, end.lng]);

  const pos = interpolate(start, end, t);
  const ang = bearing(start, end);

 
  const planeIcon = useMemo(
    () =>
      L.divIcon({
        html: `<div style="font-size:22px; transform: rotate(${ang}deg); line-height:1">✈️</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15], 
        className: "plane-icon", 
      }),
    [ang]
  );

  return (
    <>
      {/* kesikli rota */}
      <Polyline
        positions={[toLL(start.lat, start.lng), toLL(end.lat, end.lng)]}
        pathOptions={{ dashArray: "6 8", weight: 2 }}
      />
      {/* başlangıç ve varış noktaları */}
      <CircleMarker center={toLL(start.lat, start.lng)} radius={6} pathOptions={{ color: "green" }} />
      <CircleMarker center={toLL(end.lat, end.lng)} radius={6} pathOptions={{ color: "red" }} />

      {/* hareket eden uçak */}
      <Marker position={toLL(pos.lat, pos.lng)} icon={planeIcon}>
        <Popup>
          <b>{flight.flightCode}</b><br />
          Başlangıç: {start.lat.toFixed(4)}, {start.lng.toFixed(4)}<br />
          Varış: {end.lat.toFixed(4)}, {end.lng.toFixed(4)}<br />
          Kalkış zamanı: {new Date(flight.departureTime).toLocaleString()}
        </Popup>
      </Marker>
    </>
  );
}
