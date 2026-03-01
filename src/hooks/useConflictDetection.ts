// src/hooks/useConflictDetection.ts
import { useEffect, useMemo } from 'react';
import { Node } from '../types';
import { Circuit } from './useConnectionGraph';

export const useConflictDetection = (
  nodes: Node[],
  circuits: Circuit[],
  onConflictDetected: (conflicts: Map<string, Set<string>>) => void
) => {
  const conflictBuses = useMemo(() => {
    const conflicts = new Map<string, Set<string>>();

    // Find buses that are in conflict circuits
    circuits.forEach(circuit => {
      if (circuit.hasConflict) {
        circuit.busIds.forEach(busId => {
          conflicts.set(busId, circuit.sourceIds);
        });
      }
    });

    return conflicts;
  }, [circuits]);

  // Auto-disable conflicting buses
  useEffect(() => {
    if (conflictBuses.size > 0) {
      onConflictDetected(conflictBuses);
    }
  }, [conflictBuses, onConflictDetected]);

  return { conflictBuses };
};
