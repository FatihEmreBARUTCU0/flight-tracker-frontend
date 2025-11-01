import { useEffect, useMemo, useState } from "react";
import "./App.css";
import MapView from "./components/MapView";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
type Mode = "live" | "replay";

export default function App() {
  const [mode, setMode] = useState<Mode>("live");

  
  const [replayNow, setReplayNow] = useState<number | null>(null);
  useEffect(() => {
    if (mode === "replay") setReplayNow(Date.now());
    else setReplayNow(null);
  }, [mode]);

  
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);


  const nowBase = replayNow ?? Date.now();


  const minTs = useMemo(
    () => (range ? range.min : nowBase - 6 * 60 * 60 * 1000),
    [range, nowBase]
  );
  const maxTs = useMemo(
    () => (range ? range.max : nowBase),
    [range, nowBase]
  );

  const [atTs, setAtTs] = useState<number>(maxTs);

  
  useEffect(() => {
    if (mode === "replay") setAtTs(nowBase);
  }, [mode, nowBase]);

 
  useEffect(() => {
    if (mode !== "replay") return;
    setAtTs((prev) => Math.min(Math.max(prev, minTs), maxTs));
  }, [mode, minTs, maxTs]);


  const [form, setForm] = useState({
    flightCode: "",
    departure_lat: 41.2753,
    departure_long: 28.7519,
    destination_lat: 40.9778,
    destination_long: 28.821,
    departureTime: new Date().toISOString(),
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]:
        ["departure_lat", "departure_long", "destination_lat", "destination_long"].includes(name)
          ? Number(value)
          : value,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_URL}/flights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${r.status}`);
      }
      setMsg("Uçuş oluşturuldu.");
      setForm((p) => ({ ...p, flightCode: "" }));
    } catch (err: any) {
      setMsg(`Hata: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>Uçuş Planla</h2>
        <form onSubmit={submit} className="form">
          <label>
            Flight Code
            <input name="flightCode" value={form.flightCode} onChange={onChange} required />
          </label>
          <div className="row2">
            <label>
              Başlangıç Lat
              <input
                name="departure_lat"
                type="number"
                step="0.0001"
                value={form.departure_lat}
                onChange={onChange}
                required
              />
            </label>
            <label>
              Başlangıç Lng
              <input
                name="departure_long"
                type="number"
                step="0.0001"
                value={form.departure_long}
                onChange={onChange}
                required
              />
            </label>
          </div>
          <div className="row2">
            <label>
              Bitiş Lat
              <input
                name="destination_lat"
                type="number"
                step="0.0001"
                value={form.destination_lat}
                onChange={onChange}
                required
              />
            </label>
            <label>
              Bitiş Lng
              <input
                name="destination_long"
                type="number"
                step="0.0001"
                value={form.destination_long}
                onChange={onChange}
                required
              />
            </label>
          </div>
          <label>
            Kalkış Zamanı (ISO)
            <input name="departureTime" value={form.departureTime} onChange={onChange} />
          </label>
          <button disabled={saving}>Kaydet</button>
          {msg && <div className="msg">{msg}</div>}
        </form>

        <hr />

        <h3>Görüntüleme Modu</h3>
        <div className="mode">
          <label>
            <input type="radio" checked={mode === "live"} onChange={() => setMode("live")} /> Canlı
          </label>
          <label>
            <input type="radio" checked={mode === "replay"} onChange={() => setMode("replay")} /> Geri Oynatım
          </label>
        </div>

        <div className="slider">
          <div className="slider-head">
            <span>Zaman</span>
            <span>{new Date(atTs).toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={minTs}
            max={maxTs}
            step={1_000}
            value={atTs}
            disabled={mode === "live"}
            onChange={(e) => setAtTs(Number(e.target.value))}
          />
          <small>
            {mode === "live"
              ? "Slider yalnızca Geri Oynatım modunda aktiftir."
              : `Aralık: son ${((maxTs - minTs) / (60 * 60 * 1000)).toFixed(2)} saat`}
          </small>
        </div>
      </aside>

      <main className="main">
        <div className="toolbar">
          <div className={`badge ${mode === "live" ? "live" : "replay"}`}>
            {mode === "live" ? "CANLI" : "GERİ OYNATIM"}
          </div>
          {mode === "replay" && (
            <div>
              Gösterilen: <b>{new Date(atTs).toLocaleString()}</b>
            </div>
          )}
        </div>
        <div className="map-wrap">
          {/* MapView artık pencereyi dışarıya bildiriyor */}
          <MapView mode={mode} at={atTs} onRangeChange={setRange} />
        </div>
      </main>
    </div>
  );
}
