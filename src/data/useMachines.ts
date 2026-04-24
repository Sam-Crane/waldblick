import { useEffect, useRef, useState } from 'react';
import { machinesRepo, type TrailPoint, type Trails } from './machinesRepo';
import type { Machine, MachineKind } from './types';

const BROADCAST_INTERVAL_MS = 30_000;
const TRAIL_WINDOW_MINUTES = 60;
const MAX_TRAIL_POINTS = 120; // ≈1 hour at 30s per ping; drops oldest first

type Broadcast = {
  kind: MachineKind;
  label?: string;
  forestId?: string;
};

type State = {
  machines: Machine[];
  trails: Trails;
};

// Live list of machines + their recent position trails.
// `broadcast` non-null starts a 30s interval that pushes the current
// user's GPS. Trails are loaded once on mount and kept fresh via
// realtime subscription on machine_positions inserts.
export function useMachines(broadcast: Broadcast | null): State {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [trails, setTrails] = useState<Trails>({});
  const intervalRef = useRef<number | null>(null);

  // Machines: current positions.
  useEffect(() => {
    const sub = machinesRepo.subscribe(setMachines);
    return () => sub.unsubscribe();
  }, []);

  // Trails: initial fetch + realtime append on every new position row.
  useEffect(() => {
    let cancelled = false;
    void machinesRepo.listTrails(TRAIL_WINDOW_MINUTES).then((data) => {
      if (!cancelled) setTrails(data);
    });

    const sub = machinesRepo.subscribeTrails((machineId, point) => {
      setTrails((prev) => appendPoint(prev, machineId, point));
    });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  // Broadcast loop unchanged.
  useEffect(() => {
    if (!broadcast) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const push = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void machinesRepo.upsertSelf({
            kind: broadcast.kind,
            label: broadcast.label,
            forestId: broadcast.forestId,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading ?? undefined,
          });
        },
        () => {
          /* GPS unavailable; try again next tick */
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    };

    push();
    intervalRef.current = window.setInterval(push, BROADCAST_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void machinesRepo.clearSelf(broadcast.forestId);
    };
  }, [broadcast?.kind, broadcast?.label, broadcast?.forestId]);

  return { machines, trails };
}

function appendPoint(prev: Trails, machineId: string, point: TrailPoint): Trails {
  const existing = prev[machineId] ?? [];
  // Cheap dedupe: if we already have this exact point, skip.
  const last = existing[existing.length - 1];
  if (last && last.lat === point.lat && last.lng === point.lng) return prev;
  const next = [...existing, point].slice(-MAX_TRAIL_POINTS);
  return { ...prev, [machineId]: next };
}
