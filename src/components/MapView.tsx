import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";

const istanbul: LatLngExpression = [41.0082, 28.9784];

export default function MapView() {
  return (
    <div className="map">
      <MapContainer center={istanbul} zoom={12} style={{ height: "60vh", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={istanbul}><Popup>Merhaba İstanbul!</Popup></Marker>
      </MapContainer>
    </div>
  );
}
