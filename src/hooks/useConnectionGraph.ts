// src/hooks/useConnectionGraph.ts
import { useMemo } from 'react';
import { Node, Wire, Circuit } from '../types';
import { computeColors, buildCircuitGraph } from '../utils/simulation';

export const useConnectionGraph = (nodes: Node[], wires: Wire[]) => {
  return useMemo(() => {
    // Build adjacency list: nodeId -> Set of connected nodeIds
    const graph = new Map<string, Set<string>>();

    // Initialize all nodes
    nodes.forEach(node => {
      graph.set(node.id, new Set());
    });

    // Step 1: Build connection graph from wires
    // Each wire establishes connections between its endpoints
    wires.forEach(wire => {
      const connectedNodes: string[] = [];
      
      // Collect all nodes directly connected to this wire
      Object.values(wire.points).forEach(point => {
        if (point.connectedTo) {
          connectedNodes.push(point.connectedTo);
        }
      });

      // Also check for spatial junctions (different wires meeting at same coordinates)
      Object.values(wire.points).forEach(point => {
        // Find all other wire points at same location
        wires.forEach(otherWire => {
          if (otherWire.id === wire.id) return;
          
          Object.values(otherWire.points).forEach(otherPoint => {
            // Same coordinates = junction connection
            if (point.x === otherPoint.x && point.y === otherPoint.y) {
              if (otherPoint.connectedTo && !connectedNodes.includes(otherPoint.connectedTo)) {
                connectedNodes.push(otherPoint.connectedTo);
              }
            }
          });
        });
      });

      // Connect all nodes found through this wire
      for (let i = 0; i < connectedNodes.length; i++) {
        for (let j = i + 1; j < connectedNodes.length; j++) {
          const nodeA = connectedNodes[i];
          const nodeB = connectedNodes[j];

          if (!graph.has(nodeA)) graph.set(nodeA, new Set());
          if (!graph.has(nodeB)) graph.set(nodeB, new Set());

          graph.get(nodeA)!.add(nodeB);
          graph.get(nodeB)!.add(nodeA);
        }
      }
    });

    return graph;
  }, [nodes, wires]);
};

/**
 * Extract numeric part from element ID for priority sorting
 */
function extractIdNumber(id: string): number {
  const match = id.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Trace circuits starting from enabled power sources using BFS
 * Returns Circuit[] format for compatibility with existing components
 */
export const useCircuitTracer = (nodes: Node[], wires: Wire[], connectionGraph: Map<string, Set<string>>) => {
  return useMemo(() => {
    // Use the pure simulation to compute colors and derive circuits
    const graph = buildCircuitGraph(nodes, wires);
    const { wireColors, busColors, contactColors, conflictedBuses, busReach } = computeColors(nodes, wires, graph) as any;

    // Map colors to source IDs (priority order ensures unique mapping)
    const enabledSources = nodes
      .filter(n => n.type === 'power' && n.enabled)
      .sort((a, b) => extractIdNumber(a.id) - extractIdNumber(b.id));

    const circuits: Circuit[] = [];

    enabledSources.forEach(source => {
      const color = source.color || '#00FF00';

      const wireIds = new Set<string>();
      const busIds = new Set<string>();
      const contactIds = new Set<string>();

      wireColors.forEach((c: string, wireId: string) => {
        if (c === color) wireIds.add(wireId);
      });

      busColors.forEach((c: string, busId: string) => {
        if (c === color) busIds.add(busId);
      });

      contactColors.forEach((c: string, contactId: string) => {
        if (c === color) contactIds.add(contactId);
      });

      if (wireIds.size === 0 && busIds.size === 0 && contactIds.size === 0) return;

      const hasConflict = Array.from(busIds).some(b => conflictedBuses && conflictedBuses.has(b));

      circuits.push({
        id: `circuit_${source.id}`,
        sourceIds: new Set([source.id]),
        busIds,
        wireIds,
        contactIds,
        color: hasConflict ? '#FF0000' : color,
        hasConflict
      });
    });

    // If there are conflicted buses, annotate all circuits for involved sources so
    // conflict detection can see which buses are reached by multiple sources.
    if (conflictedBuses && busReach) {
      conflictedBuses.forEach((b: string) => {
        const sources = busReach.get(b) || new Set<string>();
        sources.forEach((src: string) => {
          const circuit = circuits.find(c => c.sourceIds.has(src));
          if (circuit) {
            circuit.busIds.add(b);
            // attach all sources that reach this bus so conflict reporting lists them
            circuit.sourceIds = new Set(Array.from(sources));
            circuit.hasConflict = true;
            circuit.color = '#FF0000';
          }
        });
      });
    }

    return circuits;
  }, [nodes, wires, connectionGraph]);
};

// Alternative implementation using the color computation results directly
export const useCircuitTracerV2 = (nodes: Node[], wires: Wire[]) => {
  return useMemo(() => {
    const graph = buildCircuitGraph(nodes, wires);
    const { wireColors, busColors, contactColors } = computeColors(nodes, wires, graph);
    
    // Group components by their assigned color
    const colorGroups = new Map<string, {
      sourceIds: Set<string>;
      wireIds: Set<string>;
      busIds: Set<string>;
      contactIds: Set<string>;
    }>();

    // Get enabled sources
    const enabledSources = nodes
      .filter(n => n.type === 'power' && n.enabled)
      .sort((a, b) => extractIdNumber(a.id) - extractIdNumber(b.id));

    // Initialize groups for each source color
    enabledSources.forEach(source => {
      const color = source.color || '#00FF00';
      if (!colorGroups.has(color)) {
        colorGroups.set(color, {
          sourceIds: new Set(),
          wireIds: new Set(),
          busIds: new Set(),
          contactIds: new Set()
        });
      }
      colorGroups.get(color)!.sourceIds.add(source.id);
    });

    // Assign wires to color groups
    wireColors.forEach((color, wireId) => {
      if (color && colorGroups.has(color)) {
        colorGroups.get(color)!.wireIds.add(wireId);
      }
    });

    // Assign buses to color groups
    nodes.forEach(node => {
      if (node.type === 'bus') {
        const busColor = busColors.get(node.id);
        if (busColor && colorGroups.has(busColor)) {
          colorGroups.get(busColor)!.busIds.add(node.id);
        }
      }
    });

    // Assign contacts to color groups
    nodes.forEach(node => {
      if (node.type === 'contact') {
        const contactColor = contactColors.get(node.id);
        if (contactColor && colorGroups.has(contactColor)) {
          colorGroups.get(contactColor)!.contactIds.add(node.id);
        }
      }
    });

    // Convert color groups to circuits
    const circuits: Circuit[] = [];
    let circuitId = 0;
    
    colorGroups.forEach((group, color) => {
      // Check for conflicts (red color indicates conflict)
      const hasConflict = color === '#FF0000' || group.sourceIds.size > 1;
      
      circuits.push({
        id: `circuit_${circuitId++}`,
        sourceIds: group.sourceIds,
        busIds: group.busIds,
        wireIds: group.wireIds,
        contactIds: group.contactIds,
        color: hasConflict ? '#FF0000' : color,
        hasConflict
      });
    });

    return circuits;
  }, [nodes, wires]);
};
