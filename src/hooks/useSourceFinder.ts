// src/hooks/useSourceFinder.ts
import { useMemo } from 'react';
import { Node } from '../types';
import { Circuit } from './useConnectionGraph';

/**
 * Determine the color for a component based on which circuit it belongs to
 */
export const useComponentColor = (
  nodeId: string,
  nodes: Node[],
  circuits: Circuit[]
): string => {
  return useMemo(() => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return '#808080';

    // Check which circuit this node belongs to
    for (const circuit of circuits) {
      if (circuit.sourceIds.has(nodeId) || circuit.busIds.has(nodeId)) {
        return circuit.color;
      }
    }

    // If not in any circuit, return gray (no power)
    return '#808080';
  }, [nodeId, nodes, circuits]);
};

/**
 * Determine the color for a wire based on which circuit it belongs to
 */
export const useWireColor = (
  wireId: string,
  circuits: Circuit[]
): string => {
  return useMemo(() => {
    for (const circuit of circuits) {
      if (circuit.wireIds.has(wireId)) {
        return circuit.color;
      }
    }
    return '#808080';
  }, [wireId, circuits]);
};

/**
 * Find all sources connected to a node (for conflict detection)
 */
export const useNodeSources = (
  nodeId: string,
  circuits: Circuit[]
): Set<string> => {
  return useMemo(() => {
    const sources = new Set<string>();
    
    for (const circuit of circuits) {
      if (circuit.sourceIds.has(nodeId) || circuit.busIds.has(nodeId)) {
        circuit.sourceIds.forEach(sourceId => sources.add(sourceId));
      }
    }
    
    return sources;
  }, [nodeId, circuits]);
};
