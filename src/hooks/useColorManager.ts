// src/hooks/useColorManager.ts
import { useCallback } from 'react';
import { Node, Wire, WirePoint } from '../types';
import { Circuit } from './useConnectionGraph';
import { POWER_COLORS, COLOR_NO_POWER, COLOR_DISABLED_POWER } from '../constants';

export const useColorManager = (nodes: Node[], circuits: Circuit[]) => {
  const getNextPowerColor = useCallback(() => {
    const powerCount = nodes.filter(n => n.type === 'power').length;
    return POWER_COLORS[powerCount % POWER_COLORS.length];
  }, [nodes]);

  /**
   * Get the color for a node based on which circuit it belongs to
   */
  const getNodeColor = useCallback((nodeId: string): string => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return '#808080';

    // Power source color
    if (node.type === 'power') {
      if (!node.enabled) {
        return COLOR_DISABLED_POWER;
      }
      return node.color || '#00FF00';
    }

    // Bus color - find which circuit it belongs to
    for (const circuit of circuits) {
      if (circuit.busIds.has(nodeId)) {
        return circuit.color;
      }
    }

    return COLOR_NO_POWER; // Not in any circuit
  }, [nodes, circuits]);

  /**
   * Get the color for a wire segment
   */
  const getSegmentColor = useCallback((startPoint: WirePoint, endPoint: WirePoint, wires: Wire[]): string => {
    // Find which wire(s) contain these points
    const wireIds = new Set<string>();

    wires.forEach(wire => {
      Object.entries(wire.points).forEach(([pointId, point]) => {
        if ((point.x === startPoint.x && point.y === startPoint.y) ||
            (point.x === endPoint.x && point.y === endPoint.y)) {
          wireIds.add(wire.id);
        }
      });
    });

    // Get circuit color from any wire in this segment
    for (const wireId of wireIds) {
      for (const circuit of circuits) {
        if (circuit.wireIds.has(wireId)) {
          return circuit.color;
        }
      }
    }

    return COLOR_NO_POWER;
  }, [circuits]);

  return {
    getNextPowerColor,
    getNodeColor,
    getSegmentColor
  };
};
