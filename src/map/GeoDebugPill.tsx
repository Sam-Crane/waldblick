import { useEffect, useState } from 'react';

// Shows raw Geolocation readings so we can see what the browser is actually
// returning — separates "wrong location" from "imprecise location."
// Removed in production builds via the `import.meta.env.DEV` gate.
export default function GeoDebugPill() {
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPos(p);
        setErr(null);
      },
      (e) => setErr(`${e.code}: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="pointer-events-none absolute bottom-24 left-4 z-10 rounded-lg bg-slate-900/80 px-3 py-2 text-[11px] text-white/90 shadow-md backdrop-blur-md">
      <div className="font-bold uppercase tracking-widest text-white/60">Geo debug</div>
      {err && <div className="text-error-container">{err}</div>}
      {!err && !pos && <div>waiting for fix…</div>}
      {pos && (
        <>
          <div className="font-mono">
            {pos.coords.latitude.toFixed(5)}, {pos.coords.longitude.toFixed(5)}
          </div>
          <div>
            accuracy:{' '}
            <span
              className={
                pos.coords.accuracy < 50
                  ? 'text-tertiary-fixed-dim'
                  : pos.coords.accuracy < 500
                    ? 'text-secondary-fixed-dim'
                    : 'text-error-container'
              }
            >
              ±{Math.round(pos.coords.accuracy)}m
            </span>
          </div>
          {pos.coords.altitude != null && <div>alt: {Math.round(pos.coords.altitude)}m</div>}
          {pos.coords.speed != null && pos.coords.speed > 0 && (
            <div>speed: {pos.coords.speed.toFixed(1)} m/s</div>
          )}
        </>
      )}
    </div>
  );
}
