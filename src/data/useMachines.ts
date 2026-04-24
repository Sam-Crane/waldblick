import { useEffect, useRef, useState } from 'react';
import { machinesRepo } from './machinesRepo';
import type { Machine, MachineKind } from './types';

const BROADCAST_INTERVAL_MS = 30_000;

type Broadcast = {
  kind: MachineKind;
  label?: string;
  forestId?: string;
};

// Live list of machines in the current user's forest.
// When `broadcast` is non-null, starts a 30s interval that upserts the
// current user's GPS as a machine row until the broadcast is cleared.
export function useMachines(broadcast: Broadcast | null) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const intervalRef = useRef<number | null>(null);

  // Realtime subscription
  useEffect(() => {
    const sub = machinesRepo.subscribe(setMachines);
    return () => sub.unsubscribe();
  }, []);

  // Broadcast loop
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
      // Remove our row so the map doesn't show a ghost of us after we stop.
      void machinesRepo.clearSelf(broadcast.forestId);
    };
  }, [broadcast?.kind, broadcast?.label, broadcast?.forestId]);

  return machines;
}
