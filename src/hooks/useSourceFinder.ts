// src/hooks/useSourceFinder.ts
import { useMemo } from 'react';
import { Node, Wire } from '../types';
import { simulateCircuit, COLOR_NEUTRAL } from '../utils/simulation';

/**
 * Determine the color for a component based on simulation results
 */
export const useComponentColor = (
  nodeId: string,
  nodes: Node[],
  wires: Wire[]
): string => {
  return useMemo(() => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return COLOR_NEUTRAL;

    // Power sources have their own color
    if (node.type === 'power') {
      if (!node.enabled) return COLOR_NEUTRAL;
      return node.color || COLOR_NEUTRAL;
    }

    // Use simulation for bus colors
    const { busColors } = simulateCircuit(nodes, wires);
    return busColors.get(nodeId) || COLOR_NEUTRAL;
  }, [nodeId, nodes, wires]);
};

/**
 * Determine the color for a wire based on simulation results
 */
export const useWireColor = (
  wireId: string,
  nodes: Node[],
  wires: Wire[]
): string => {
  return useMemo(() => {
    const { wireColors } = simulateCircuit(nodes, wires);
    return wireColors.get(wireId) || COLOR_NEUTRAL;
  }, [wireId, nodes, wires]);
};

/**
 * Find all sources connected to a node (for conflict detection)
 */
export const useNodeSources = (
  nodeId: string,
  nodes: Node[],
  wires: Wire[]
): Set<string> => {
  return useMemo(() => {
    const sources = new Set<string>();
    const { contactColors } = simulateCircuit(nodes, wires);
    
    // Find which color this contact has
    const contactColor = contactColors.get(nodeId);
    if (!contactColor) return sources;

    // Find all enabled sources with the same color
    nodes
      .filter(n => n.type === 'power' && n.enabled)
      .forEach(source => {
        if (source.color === contactColor) {
          sources.add(source.id);
        }
      });

    return sources;
  }, [nodeId, nodes, wires]);
};
