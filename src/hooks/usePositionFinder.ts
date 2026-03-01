// src/hooks/usePositionFinder.ts
import { useCallback } from 'react';
import { Node, Wire, FindWirePointResult } from '../types';
import { NODE_SNAP_RADIUS, POINT_EDIT_RADIUS } from '../constants';
import { calculateDistance } from '../utils/grid';

export const usePositionFinder = (nodes: Node[], wires: Wire[]) => {
  const findNodeAtPosition = useCallback((x: number, y: number, radius: number = NODE_SNAP_RADIUS): Node | null => {
    return nodes.find(node => {
      if (calculateDistance(node.x, node.y, x, y) <= radius) {
        return true;
      }
      return false;
    }) || null;
  }, [nodes]);

  const findWirePointAtPosition = useCallback((x: number, y: number): FindWirePointResult | null => {
    for (const wire of wires) {
      for (const pointId in wire.points) {
        const point = wire.points[pointId];
        if (Math.abs(point.x - x) <= POINT_EDIT_RADIUS && Math.abs(point.y - y) <= POINT_EDIT_RADIUS) {
          return { wire, point, pointId };
        }
      }
    }
    return null;
  }, [wires]);

  return {
    findNodeAtPosition,
    findWirePointAtPosition
  };
};
