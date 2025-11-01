import type { LatLngExpression } from "leaflet";
export const toLL = (lat: number, lng: number) => [lat, lng] as LatLngExpression;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const bearing = (a: {lat:number;lng:number}, b:{lat:number;lng:number}) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat), λ1 = toRad(a.lng), λ2 = toRad(b.lng);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};
