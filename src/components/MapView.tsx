// src/components/MapView.tsx
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import ws from "../ws";

type Flight = {
  _id: string;
  flightCode: string;
  departure_lat: number;
  departure_long: number;
  destination_lat: number;
  destination_long: number;
  departureTime: string; // ISO
};

const center: LatLngExpression = [41.0082, 28.9784]; // İstanbul

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export default function MapView() {
  const [flights, setFlights] = useState<Flight[]>([]);

  // İlk yüklemede listeleri çek
  useEffect(() => {
    fetch(`${API_URL}/flights`)
      .then((r) => r.json())
      .then(setFlights)
      .catch((e) => console.error("[flights] fetch error:", e));
  }, []);

  // WebSocket ile yeni uçuşları canlı ekle
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "flight.created" && msg.flight) {
          setFlights((prev) => [...prev, msg.flight]);
        }
      } catch {
        /* noop */
      }
    };
    ws.addEventListener("message", onMessage);
    return () => ws.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="map">
      <MapContainer center={center} zoom={11} style={{ height: "70vh", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* var olan örnek markerını istersen bırakma */}
        {/* <Marker position={center}><Popup>Merhaba İstanbul!</Popup></Marker> */}

        {flights.map((f) => (
          <Marker
            key={f._id}
            position={[f.departure_lat, f.departure_long] as LatLngExpression}
          >
            <Popup>
              <b>{f.flightCode}</b><br />
              Kalkış: {f.departure_lat.toFixed(4)}, {f.departure_long.toFixed(4)}<br />
              Varış: {f.destination_lat.toFixed(4)}, {f.destination_long.toFixed(4)}<br />
              Zaman: {new Date(f.departureTime).toLocaleString()}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
