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
  }, [nodes, circuits]);

  /**
   * Get the color for a wire segment using simulation results
   */
  const getSegmentColor = useCallback((startPoint: WirePoint, endPoint: WirePoint, allWires: Wire[]): string => {
    // Find which wire contains both points
    for (const wire of allWires) {
      const pointsArray = Object.values(wire.points);
      const hasStart = pointsArray.some(p => p.x === startPoint.x && p.y === startPoint.y);
      const hasEnd = pointsArray.some(p => p.x === endPoint.x && p.y === endPoint.y);
      
      if (hasStart && hasEnd) {
        // Use simulation result if available, otherwise fall back to circuit lookup
        const simColor = simulation.wireColors.get(wire.id);
        if (simColor) return simColor;
        
        // Fallback to circuit-based lookup
        for (const circuit of circuits) {
          if (circuit.wireIds.has(wire.id)) {
            return circuit.color;
          }
        }
      }
    }

    return COLOR_NEUTRAL;
  }, [circuits, simulation.wireColors]);

  return {
    getNextPowerColor,
    getNodeColor,
    getSegmentColor,
    simulation
  };
};
