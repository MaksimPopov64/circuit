/**
 * Circuit Simulation Module
 * 
 * Implements BFS-based color propagation algorithm for electrical circuit simulation.
 * Follows the technical specification for emulation of buses, sources, and wires.
 */

import { Node, Wire } from '../types';

/**
 * Represents a contact (connection point) in the circuit graph
 */
export interface Contact {
  id: string;
  x: number;
  y: number;
  type: 'source' | 'bus' | 'junction';
  elementId: string; // The source/bus this contact belongs to
}

/**
 * Represents an edge in the circuit graph
 */
export interface GraphEdge {
  toId: string;
  type: 'wire' | 'bus';
  elementId: string; // The wire or bus this edge represents
  active: boolean; // For buses: true only if bus is on
}

/**
 * Graph representation as adjacency list
 */
export type CircuitGraph = Map<string, GraphEdge[]>;

/**
 * Color assignment result
 */
export interface ColorAssignment {
  wireColors: Map<string, string>;
  busColors: Map<string, string>;
  contactColors: Map<string, string>;
  conflictedBuses?: Set<string>;
  busReach?: Map<string, Set<string>>;
}

/**
 * Neutral color for de-energized components
 */
export const COLOR_NEUTRAL = '#808080';

/**
 * Build a graph model from the circuit schema
 * 
 * Vertices: all contacts (source contacts, bus contacts, junction nodes)
 * Edges: wires (always active) and buses (active only when on)
 */
export function buildCircuitGraph(nodes: Node[], wires: Wire[]): CircuitGraph {
  const graph: CircuitGraph = new Map();

  // Step 1: Create contacts for all sources and buses
  const contacts = new Map<string, Contact>();

  nodes.forEach(node => {
    const contact: Contact = {
      id: node.id,
      x: node.x,
      y: node.y,
      type: node.type === 'power' ? 'source' : 'bus',
      elementId: node.id
    };
    contacts.set(node.id, contact);
    graph.set(node.id, []);
  });

  // Step 2: Add junction contacts for wire bend/junction points
  const junctionContacts = new Map<string, string>(); // coordinates -> contact id
  wires.forEach(wire => {
    Object.values(wire.points).forEach(point => {
      const coordKey = `${point.x},${point.y}`;
      // Check if there's already a junction at these coordinates
      let junctionId = junctionContacts.get(coordKey);

      // If not cached, determine whether this coordinate matches an existing node
      if (!junctionId) {
        const existingNode = nodes.find(n => n.x === point.x && n.y === point.y);
        if (existingNode) {
          junctionId = existingNode.id;
          // cache mapping so other points at same coords reuse it
          junctionContacts.set(coordKey, junctionId);
        } else {
          // Create a new junction contact
          junctionId = `junction_${point.x}_${point.y}`;
          const contact: Contact = {
            id: junctionId,
            x: point.x,
            y: point.y,
            type: 'junction',
            elementId: wire.id
          };
          contacts.set(junctionId, contact);
          if (!graph.has(junctionId)) {
            graph.set(junctionId, []);
          }
          junctionContacts.set(coordKey, junctionId);
        }
      }

      // If this point lies exactly at a node coordinate, ensure the point is connected
      if (!point.connectedTo) {
        // If junctionId corresponds to an actual node id, connect the point to that node
        const maybeNode = nodes.find(n => n.id === junctionId);
        if (maybeNode) {
          point.connectedTo = maybeNode.id;
        } else {
          // else treat as junction and store its id
          point.id = junctionId;
        }
      }
    });
  });

  // Spatial junction detection: if a wire point lies on/near another wire's segment,
  // ensure we treat that coordinate as a junction so wires connect at intersections.
  const pointToLineSegmentDistance = (
    point: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number }
  ) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(point.x - p1.x, point.y - p1.y);
    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = p1.x + t * dx;
    const projY = p1.y + t * dy;
    return Math.hypot(point.x - projX, point.y - projY);
  };

  const SPATIAL_THRESHOLD = 2; // pixels

  wires.forEach(wire => {
    Object.values(wire.points).forEach(point => {
      const coordKey = `${point.x},${point.y}`;

      // check against all other wires' segments
      for (const otherWire of wires) {
        if (otherWire.id === wire.id) continue;
        const segPoints = Object.values(otherWire.points);
        for (let i = 0; i < segPoints.length - 1; i++) {
          const p1 = segPoints[i];
          const p2 = segPoints[i + 1];
          const dist = pointToLineSegmentDistance(point, p1, p2);
          if (dist <= SPATIAL_THRESHOLD) {
            // compute projection point on the segment to get exact intersection coords
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const l2 = dx * dx + dy * dy;
            let t = 0;
            if (l2 !== 0) {
              t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / l2;
              t = Math.max(0, Math.min(1, t));
            }
            const projX = Math.round(p1.x + t * dx);
            const projY = Math.round(p1.y + t * dy);
            const junctionId = junctionContacts.get(coordKey) || `junction_${projX}_${projY}`;

            if (!junctionContacts.has(coordKey)) {
              junctionContacts.set(coordKey, junctionId);
            }

            // Also map the projected coordinates so inserted points find the same junction
            const projKey = `${projX},${projY}`;
            if (!junctionContacts.has(projKey)) junctionContacts.set(projKey, junctionId);

            if (!contacts.has(junctionId)) {
              const contact: Contact = {
                id: junctionId,
                x: projX,
                y: projY,
                type: 'junction',
                elementId: wire.id
              };
              contacts.set(junctionId, contact);
            }

            if (!graph.has(junctionId)) graph.set(junctionId, []);

            // if point wasn't connectedTo and not matched to a real node, set its id
            if (!point.connectedTo) point.id = junctionId;

            // Ensure the other wire has a point at the intersection. If not, insert one between p1 and p2.
            const otherPoints = otherWire.points as any;
            // Check if otherWire already has a point at proj coordinates
            const exists = Object.values(otherPoints).some((op: any) => op.x === projX && op.y === projY);
            if (!exists) {
              const newPoint = { x: projX, y: projY, connectedTo: undefined, id: junctionId } as any;
              if (Array.isArray(otherPoints)) {
                // insert after p1 (i index) so ordering is preserved
                otherPoints.splice(i + 1, 0, newPoint);
              } else {
                // points stored as object map; create a new key
                const key = `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
                otherPoints[key] = newPoint;
              }
            }
          }
        }
      }
    });
  });

  // Step 3: Add wire edges (undirected, always active)
  wires.forEach(wire => {
    const points = Object.values(wire.points);
    
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const pointA = points[i];
        const pointB = points[j];
        
        // Find the contact IDs for these points
        const coordAKey = `${pointA.x},${pointA.y}`;
        const coordBKey = `${pointB.x},${pointB.y}`;

        const contactAId = pointA.connectedTo || junctionContacts.get(coordAKey) || `junction_${pointA.x}_${pointA.y}`;
        const contactBId = pointB.connectedTo || junctionContacts.get(coordBKey) || `junction_${pointB.x}_${pointB.y}`;
        
        // Add bidirectional edges
        if (graph.has(contactAId) && graph.has(contactBId)) {
          graph.get(contactAId)!.push({
            toId: contactBId,
            type: 'wire',
            elementId: wire.id,
            active: true
          });
          graph.get(contactBId)!.push({
            toId: contactAId,
            type: 'wire',
            elementId: wire.id,
            active: true
          });
        }
      }
    }
  });

  // Step 4: Add bus edges (complete subgraph, active only when bus is on)
  nodes.filter(n => n.type === 'bus').forEach(bus => {
    // Find all other contacts at the same coordinates (bus connections)
    const connectedContacts: string[] = [];
    
    // Check junctions at bus coordinates
    const coordKey = `${bus.x},${bus.y}`;
    junctionContacts.forEach((junctionId, key) => {
      if (key === coordKey && junctionId !== bus.id) {
        connectedContacts.push(junctionId);
      }
    });
    
    // Check wire points at bus coordinates
    wires.forEach(wire => {
      Object.values(wire.points).forEach(point => {
        if (point.x === bus.x && point.y === bus.y) {
          const pointContactId = point.connectedTo || `junction_${point.x}_${point.y}`;
          if (!connectedContacts.includes(pointContactId) && pointContactId !== bus.id) {
            connectedContacts.push(pointContactId);
          }
        }
      });
    });
    
    // Create edges between bus and all connected contacts (only if bus is on)
    const busIsOn = bus.enabled;
    
    connectedContacts.forEach(contactId => {
      if (graph.has(contactId)) {
        // Bus to contact edge
        graph.get(bus.id)!.push({
          toId: contactId,
          type: 'bus',
          elementId: bus.id,
          active: busIsOn
        });
        
        // Contact to bus edge
        graph.get(contactId)!.push({
          toId: bus.id,
          type: 'bus',
          elementId: bus.id,
          active: busIsOn
        });
      }
    });
    
    // Create edges between all pairs of connected contacts through the bus
    // (complete subgraph, only active when bus is on)
    for (let i = 0; i < connectedContacts.length; i++) {
      for (let j = i + 1; j < connectedContacts.length; j++) {
        const contactA = connectedContacts[i];
        const contactB = connectedContacts[j];
        
        if (graph.has(contactA) && graph.has(contactB)) {
          // These contacts are connected through the bus
          graph.get(contactA)!.push({
            toId: contactB,
            type: 'bus',
            elementId: bus.id,
            active: busIsOn
          });
          graph.get(contactB)!.push({
            toId: contactA,
            type: 'bus',
            elementId: bus.id,
            active: busIsOn
          });
        }
      }
    }
  });

  return graph;
}

// Debug helper to pretty-print graph
function dumpGraph(graph: CircuitGraph) {
  try {
    const obj: Record<string, any> = {};
    for (const [k, edges] of graph.entries()) {
      obj[k] = edges.map(e => ({ toId: e.toId, type: e.type, elementId: e.elementId, active: e.active }));
    }
    console.debug('[simulate] graph:', obj);
  } catch (err) {
    console.debug('[simulate] graph dump failed', err);
  }
}


/**
 * Extract numeric part from element ID for priority sorting
 * e.g., "P1" -> 1, "B10" -> 10
 */
function extractIdNumber(id: string): number {
  const match = id.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * BFS-based color propagation algorithm
 * 
 * Implements the algorithm from the technical specification:
 * 1. Initialize color map as null (de-energized)
 * 2. Get all sources sorted by priority (smaller ID = higher priority)
 * 3. For each source, BFS from its contact
 * 4. Color visited vertices/edges if not already colored
 * 5. Stop at already-colored vertices (higher priority claimed them)
 */
export function computeColors(
  nodes: Node[],
  wires: Wire[],
  graph: CircuitGraph
): ColorAssignment {
  const wireColors = new Map<string, string>();
  const busColors = new Map<string, string>();
  const contactColors = new Map<string, string>();

  // reachability maps used for conflict detection
  const busReach = new Map<string, Set<string>>();
  const wireReach = new Map<string, Set<string>>();

  // Get all enabled sources, sorted by ID (smaller ID = higher priority)
  const enabledSources = nodes
    .filter(n => n.type === 'power' && n.enabled)
    .sort((a, b) => extractIdNumber(a.id) - extractIdNumber(b.id));

  // Process each source in priority order
  enabledSources.forEach(source => {
    const sourceColor = source.color || COLOR_NEUTRAL;
    
    // BFS from this source's contact
    const queue: string[] = [source.id];
    const visited = new Set<string>([source.id]);
    
    // Color the source contact
    if (!contactColors.has(source.id)) contactColors.set(source.id, sourceColor);

    // --- Reachability BFS (ignores priority coloring) ---
    const rVisited = new Set<string>([source.id]);
    const rQueue: string[] = [source.id];
    while (rQueue.length > 0) {
      const cur = rQueue.shift()!;
      const redges = graph.get(cur) || [];
      for (const re of redges) {
        if (!re.active) continue;
        // record reach for wires and buses
        if (re.type === 'wire') {
          if (!wireReach.has(re.elementId)) wireReach.set(re.elementId, new Set());
          wireReach.get(re.elementId)!.add(source.id);
        } else if (re.type === 'bus') {
          if (!busReach.has(re.elementId)) busReach.set(re.elementId, new Set());
          busReach.get(re.elementId)!.add(source.id);
        }

        if (!rVisited.has(re.toId)) {
          rVisited.add(re.toId);
          rQueue.push(re.toId);
        }
      }
    }

    while (queue.length > 0) {
      const currentContactId = queue.shift()!;
      // If this contact is a bus and it's disabled, do not traverse through it.
      const maybeBus = nodes.find(n => n.id === currentContactId && n.type === 'bus');
      if (maybeBus && !maybeBus.enabled) {
        // We still keep the bus contact colored (it was colored when enqueued),
        // but we must not traverse any outgoing edges through a disabled bus.
        continue;
      }

      const edges = graph.get(currentContactId) || [];

      for (const edge of edges) {
        // Skip inactive edges (disabled buses)
        if (!edge.active) continue;

        // If target contact already has color (from higher-priority source), do not traverse through it
        if (contactColors.has(edge.toId)) {
          // Still, record the edge color for this source only if the edge isn't yet colored
          if (edge.type === 'wire' && !wireColors.has(edge.elementId)) {
            wireColors.set(edge.elementId, sourceColor);
          }
          if (edge.type === 'bus' && !busColors.has(edge.elementId)) {
            busColors.set(edge.elementId, sourceColor);
          }
          continue;
        }

        // Color the edge (wire or bus) if not already colored
        if (edge.type === 'wire') {
          if (!wireColors.has(edge.elementId)) {
            wireColors.set(edge.elementId, sourceColor);
          }
        } else if (edge.type === 'bus') {
          if (!busColors.has(edge.elementId)) {
            busColors.set(edge.elementId, sourceColor);
          }
        }

        // Visit the target contact if not already visited
        if (!visited.has(edge.toId)) {
          visited.add(edge.toId);
          contactColors.set(edge.toId, sourceColor);
          // If the target contact is a bus node, also set bus color
          const targetNode = nodes.find(n => n.id === edge.toId && n.type === 'bus');
          if (targetNode) {
            if (!busColors.has(targetNode.id)) {
              busColors.set(targetNode.id, sourceColor);
            }
          }
          queue.push(edge.toId);
        }
      }
    }
  });

  // Determine conflicted buses (reached by more than one source)
  const conflictedBuses = new Set<string>();
  for (const [busId, srcs] of busReach.entries()) {
    if (srcs.size > 1) conflictedBuses.add(busId);
  }

  return {
    wireColors,
    busColors,
    contactColors,
    conflictedBuses,
    busReach
  };
}

/**
 * Main simulation function
 * 
 * Takes the current circuit schema and returns color assignments
 * for all wires, buses, and contacts.
 */
export function simulateCircuit(nodes: Node[], wires: Wire[]): ColorAssignment {
  console.debug('[simulate] simulateCircuit called with nodes:', nodes.map(n => ({ id: n.id, type: n.type, enabled: n.enabled })));
  console.debug('[simulate] wires:', wires.map(w => ({ id: w.id, points: Object.values(w.points).map(p => ({ x: p.x, y: p.y, connectedTo: p.connectedTo })) })));
  const graph = buildCircuitGraph(nodes, wires);
  dumpGraph(graph);
  const result = computeColors(nodes, wires, graph);
  console.debug('[simulate] result:', {
    wireColors: Array.from(result.wireColors.entries()),
    busColors: Array.from(result.busColors.entries()),
    contactColors: Array.from(result.contactColors.entries())
  });
  return result;
}

/**
 * Get the color for a specific wire
 */
export function getWireColor(
  wireId: string,
  nodes: Node[],
  wires: Wire[]
): string {
  const { wireColors } = simulateCircuit(nodes, wires);
  return wireColors.get(wireId) || COLOR_NEUTRAL;
}

/**
 * Get the color for a specific bus
 */
export function getBusColor(
  busId: string,
  nodes: Node[],
  wires: Wire[]
): string {
  const bus = nodes.find(n => n.id === busId);
  
  // Disabled buses that are not in any circuit should appear neutral
  if (!bus?.enabled) {
    const { busColors } = simulateCircuit(nodes, wires);
    return busColors.get(busId) || COLOR_NEUTRAL;
  }
  
  const { busColors } = simulateCircuit(nodes, wires);
  return busColors.get(busId) || COLOR_NEUTRAL;
}

/**
 * Get the color for a specific node (source or bus)
 */
export function getNodeColor(
  nodeId: string,
  nodes: Node[],
  wires: Wire[]
): string {
  const node = nodes.find(n => n.id === nodeId);
  
  if (!node) return COLOR_NEUTRAL;
  
  // Sources have their own color when enabled
  if (node.type === 'power') {
    if (!node.enabled) return COLOR_NEUTRAL;
    return node.color || COLOR_NEUTRAL;
  }
  
  // Buses get color from simulation
  return getBusColor(nodeId, nodes, wires);
}

/**
 * Check if a node is energized (has power from any source)
 */
export function isEnergized(
  nodeId: string,
  nodes: Node[],
  wires: Wire[]
): boolean {
  const color = getNodeColor(nodeId, nodes, wires);
  return color !== COLOR_NEUTRAL;
}

/**
 * Check if a wire is energized
 */
export function isWireEnergized(
  wireId: string,
  nodes: Node[],
  wires: Wire[]
): boolean {
  const color = getWireColor(wireId, nodes, wires);
  return color !== COLOR_NEUTRAL;
}
