// src/hooks/useColorManager.ts
import { useCallback, useMemo } from 'react';
import { Node, Wire, WirePoint, Circuit } from '../types';
import { simulateCircuit, COLOR_NEUTRAL } from '../utils/simulation';
import { POWER_COLORS, COLOR_DISABLED_POWER } from '../constants';

export const useColorManager = (nodes: Node[], circuits: Circuit[], wires?: Wire[]) => {
  // Get simulation results for direct wire/bus color lookup
  const simulation = useMemo(() => {
    if (wires) {
      return simulateCircuit(nodes, wires);
    }
    return { wireColors: new Map(), busColors: new Map(), contactColors: new Map() };
  }, [nodes, wires]);

  const getNextPowerColor = useCallback(() => {
    const powerCount = nodes.filter(n => n.type === 'power').length;
    return POWER_COLORS[powerCount % POWER_COLORS.length];
  }, [nodes]);

  /**
   * Get the color for a node based on which circuit it belongs to
   */
  const getNodeColor = useCallback((nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return COLOR_NEUTRAL;

    // Power source color
    if (node.type === 'power') {
      if (!node.enabled) {
        return COLOR_DISABLED_POWER;
      }
      return node.color || '#00FF00';
    }

    // Bus color - prefer simulation results when available
    if (node.type === 'bus') {
      if (!node.enabled) return COLOR_DISABLED_POWER;
      const simBusColor = simulation.busColors.get(nodeId) || simulation.contactColors.get(nodeId);
      if (simBusColor) return simBusColor;

      // Fallback to circuit membership
      for (const circuit of circuits) {
        if (circuit.busIds.has(nodeId)) {
          return circuit.color;
        }
      }
      return COLOR_NEUTRAL;
    }

    return COLOR_NEUTRAL; // Not in any circuit
  }, [nodes, circuits, simulation.busColors, simulation.contactColors]);

  /**
   * Resolve a wire point to its canonical contact ID (same logic as buildCircuitGraph).
   */
  const resolveContactId = useCallback((p: WirePoint): string => {
    if (p.connectedTo) return p.connectedTo;
    const nodeAtPos = nodes.find(n => n.x === p.x && n.y === p.y);
    if (nodeAtPos) return nodeAtPos.id;
    return `junction_${p.x}_${p.y}`;
  }, [nodes]);

  /**
   * Get the colour for a single wire segment using per-endpoint contact colours.
   *
   * A segment is energised (and coloured) only when BOTH its endpoints are reached
   * by the same source.  This correctly turns off the segment that lies on the
   * "output" side of a disabled bus even when the input side (and the bus contact
   * itself) is coloured.
   */
  const getSegmentColor = useCallback((startPoint: WirePoint, endPoint: WirePoint, _allWires: Wire[]): string => {
    const startId = resolveContactId(startPoint);
    const endId   = resolveContactId(endPoint);

    const startColor = simulation.contactColors.get(startId);
    const endColor   = simulation.contactColors.get(endId);

    // Both endpoints energised by the same source → show that colour.
    if (startColor && endColor && startColor === endColor) return startColor;

    return COLOR_NEUTRAL;
  }, [resolveContactId, simulation.contactColors]);

  return {
    getNextPowerColor,
    getNodeColor,
    getSegmentColor,
    simulation
  };
};
