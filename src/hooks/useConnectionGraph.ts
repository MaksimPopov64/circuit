// src/hooks/useConnectionGraph.ts
import { useMemo } from 'react';
import { Node, Wire } from '../types';

export interface Circuit {
  id: string;
  sourceIds: Set<string>;
  busIds: Set<string>;
  wireIds: Set<string>;
  color: string;
  hasConflict: boolean;
}

/**
 * Calculate the distance from a point to a line segment
 * Returns the closest distance. If point touches the segment, distance will be near 0
 */
const pointToLineSegmentDistance = (
  point: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSquared = dx * dx + dy * dy;

  // Handle degenerate case where p1 and p2 are the same point
  if (lengthSquared === 0) {
    return Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
  }

  // Calculate the projection of the point onto the line
  const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSquared));
  const closestX = p1.x + t * dx;
  const closestY = p1.y + t * dy;

  return Math.sqrt((point.x - closestX) ** 2 + (point.y - closestY) ** 2);
};

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
 * Trace circuits starting from enabled power sources using BFS
 * This is the core algorithm that determines which components belong to which circuit
 */
export const useCircuitTracer = (nodes: Node[], wires: Wire[], connectionGraph: Map<string, Set<string>>) => {
  return useMemo(() => {
    const circuits: Circuit[] = [];
    const visitedNodes = new Set<string>();
    const visitedWires = new Set<string>();

    // Start from each enabled power source
    const enabledSources = nodes.filter(n => n.type === 'power' && n.enabled);

    enabledSources.forEach(source => {
      if (visitedNodes.has(source.id)) return; // Already part of another circuit

      const circuit: Circuit = {
        id: `circuit_${source.id}`,
        sourceIds: new Set([source.id]),
        busIds: new Set(),
        wireIds: new Set(),
        color: source.color || '#00FF00',
        hasConflict: false
      };

      // BFS from this source to find all connected components
      const queue = [source.id];
      visitedNodes.add(source.id);

      while (queue.length > 0) {
        const currentNodeId = queue.shift()!;

        // Find all wires connected to this node
        wires.forEach(wire => {
          let wireConnectsToNode = false;
          let otherNodeIds: string[] = [];
          let hasDisabledBus = false;

          // Check all points in this wire
          Object.values(wire.points).forEach(point => {
            if (point.connectedTo === currentNodeId) {
              wireConnectsToNode = true;
            }
            // Only add connected power sources - they are endpoints
            if (point.connectedTo) {
              const connectedNode = nodes.find(n => n.id === point.connectedTo);
              if (connectedNode && connectedNode.type === 'power' && connectedNode.enabled) {
                otherNodeIds.push(point.connectedTo);
              }
            }

            // Check for spatial junctions at this point (wire-to-wire)
            wires.forEach(otherWire => {
              if (otherWire.id === wire.id) return;
              Object.values(otherWire.points).forEach(otherPoint => {
                if (point.x === otherPoint.x && point.y === otherPoint.y && otherPoint.connectedTo) {
                  const connectedNode = nodes.find(n => n.id === otherPoint.connectedTo);
                  if (connectedNode && connectedNode.type === 'power' && connectedNode.enabled) {
                    if (!otherNodeIds.includes(otherPoint.connectedTo)) {
                      otherNodeIds.push(otherPoint.connectedTo);
                    }
                  }
                }
              });
            });

            // Check for buses at the same coordinates
            nodes.forEach(node => {
              if (node.type === 'bus' && node.x === point.x && node.y === point.y) {
                if (!otherNodeIds.includes(node.id)) {
                  otherNodeIds.push(node.id);
                }
                // Track disabled buses - they block further traversal
                if (!node.enabled) {
                  hasDisabledBus = true;
                }
              }
            });
          });

          // If this wire is connected to current node and not yet visited
          if (wireConnectsToNode && !visitedWires.has(wire.id)) {
            visitedWires.add(wire.id);
            circuit.wireIds.add(wire.id);

            // Add all connected nodes to queue
            otherNodeIds.forEach(nodeId => {
              const node = nodes.find(n => n.id === nodeId);
              if (!node || visitedNodes.has(nodeId)) return;

              visitedNodes.add(nodeId);
              
              // Only continue traversing from enabled power sources and enabled buses
              // Disabled buses are added to circuit but don't continue traversal
              if (node.type === 'power' && node.enabled) {
                queue.push(nodeId);
                circuit.sourceIds.add(nodeId);
              } else if (node.type === 'bus') {
                circuit.busIds.add(nodeId);
                // Only continue traversal from enabled buses
                if (node.enabled) {
                  queue.push(nodeId);
                }
              }
            });
          }
        });
      }

      // Keep checking for wires that touch circuit wires until no new wires are found
      let foundNewWires = true;
      while (foundNewWires) {
        foundNewWires = false;
        const circuitWiresList = Array.from(circuit.wireIds).map(id => wires.find(w => w.id === id)!);
        
        for (const wire of wires) {
          if (visitedWires.has(wire.id)) continue; // Already processed

          const wirePointsArray = Object.values(wire.points);

          // Check if this wire touches any circuit wire (any point on the wire touches any edge of circuit wires)
          let touchesCircuitWire = false;
          
          outerLoop: for (const point of wirePointsArray) {
            for (const circuitWire of circuitWiresList) {
              const circuitPointsArray = Object.values(circuitWire.points);
              // Check each edge of the circuit wire
              for (let i = 0; i < circuitPointsArray.length - 1; i++) {
                const p1 = circuitPointsArray[i];
                const p2 = circuitPointsArray[i + 1];
                const distance = pointToLineSegmentDistance(point, p1, p2);
                
                // If point is within 2 pixels of the line segment, consider it touching
                if (distance <= 2) {
                  touchesCircuitWire = true;
                  break outerLoop;
                }
              }
            }
          }

          // If this wire touches a circuit wire, add it and process its endpoints
          if (touchesCircuitWire) {
            foundNewWires = true;
            visitedWires.add(wire.id);
            circuit.wireIds.add(wire.id);

            // Process endpoints of this wire to find connected nodes
            for (const point of wirePointsArray) {
              if (point.connectedTo) {
                const node = nodes.find(n => n.id === point.connectedTo);
                if (node && !visitedNodes.has(point.connectedTo)) {
                  // Add all buses (enabled or disabled) to circuit
                  if (node.type === 'bus') {
                    visitedNodes.add(point.connectedTo);
                    circuit.busIds.add(point.connectedTo);
                    // Only continue traversal from enabled buses
                    if (node.enabled) {
                      queue.push(point.connectedTo);
                    }
                  } else if (node.type === 'power' && node.enabled) {
                    // Only add enabled power sources and continue traversal
                    visitedNodes.add(point.connectedTo);
                    queue.push(point.connectedTo);
                    circuit.sourceIds.add(point.connectedTo);
                  }
                }
              }

              // Also add all buses at the same coordinates (both enabled and disabled act as endpoints)
              for (const node of nodes) {
                if (node.type === 'bus' && node.x === point.x && node.y === point.y && !visitedNodes.has(node.id)) {
                  visitedNodes.add(node.id);
                  circuit.busIds.add(node.id);
                  // Only continue traversal from enabled buses
                  if (node.enabled) {
                    queue.push(node.id);
                  }
                }
              }
            }
          }
        }
      }

      // Check for conflicts (multiple sources)
      if (circuit.sourceIds.size > 1) {
        circuit.hasConflict = true;
        circuit.color = '#FF0000'; // Red for conflict
      }

      circuits.push(circuit);
    });

    return circuits;
  }, [nodes, wires]);
};

