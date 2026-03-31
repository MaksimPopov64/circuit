/**
 * Circuit Simulation Module
 *
 * BFS-based colour propagation for electrical circuit simulation.
 * Rules:
 *  - Every wire is a conductor (always active).
 *  - Every bus is a switch: when enabled current passes through, when disabled it stops.
 *  - Sources emit colour in priority order (lower numeric ID = higher priority).
 *  - Colour propagates from a source until it hits a disabled bus or an already-coloured contact.
 */

import { Node, Wire, WirePoint } from '../types';

export interface Contact {
  id: string;
  x: number;
  y: number;
  type: 'source' | 'bus' | 'junction';
  elementId: string;
}

export interface GraphEdge {
  toId: string;
  type: 'wire' | 'bus';
  elementId: string;
  /** For bus-type edges: false when the bus is disabled (open switch). */
  active: boolean;
}

export type CircuitGraph = Map<string, GraphEdge[]>;

export interface ColorAssignment {
  wireColors: Map<string, string>;
  busColors: Map<string, string>;
  contactColors: Map<string, string>;
  conflictedBuses?: Set<string>;
  busReach?: Map<string, Set<string>>;
}

export const COLOR_NEUTRAL = '#808080';

// ─── helpers ────────────────────────────────────────────────────────────────

function extractIdNumber(id: string): number {
  const m = id.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

// ─── graph builder ──────────────────────────────────────────────────────────

/**
 * Build a pure adjacency-list graph from the current circuit state.
 *
 * Vertices: node IDs (power / bus) + virtual junction IDs at every wire-point
 *           coordinate that does not coincide with a node.
 * Wire edges: undirected, always active.
 * Bus edges: undirected, active only when the bus is enabled.
 *
 * IMPORTANT: this function is pure – it never mutates the input arrays.
 */
export function buildCircuitGraph(nodes: Node[], wires: Wire[]): CircuitGraph {
  const graph: CircuitGraph = new Map();

  // ── Step 1: vertices for every node ──────────────────────────────────────
  nodes.forEach(node => graph.set(node.id, []));

  // ── Step 2: coordinate → contact-ID map (no mutations!) ─────────────────
  // Node positions take priority over junction IDs.
  const coordToContact = new Map<string, string>();

  nodes.forEach(node => {
    coordToContact.set(`${node.x},${node.y}`, node.id);
  });

  wires.forEach(wire => {
    Object.values(wire.points).forEach(point => {
      const key = `${point.x},${point.y}`;
      if (!coordToContact.has(key)) {
        const jId = `junction_${point.x}_${point.y}`;
        coordToContact.set(key, jId);
        if (!graph.has(jId)) graph.set(jId, []);
      }
    });
  });

  // Resolve a wire point to its canonical contact ID (read-only).
  const resolveContact = (point: WirePoint): string =>
    point.connectedTo ??
    coordToContact.get(`${point.x},${point.y}`) ??
    `junction_${point.x}_${point.y}`;

  // ── Step 3: wire edges (tree traversal via outgoing arrays) ───────────────
  wires.forEach(wire => {
    const visitedPoints = new Set<string>();

    const connectPoint = (pointId: string) => {
      if (visitedPoints.has(pointId)) return;
      visitedPoints.add(pointId);

      const point = wire.points[pointId];
      if (!point) return;

      const contactId = resolveContact(point);
      if (!graph.has(contactId)) graph.set(contactId, []);

      for (const childId of point.outgoing) {
        const child = wire.points[childId];
        if (!child) continue;

        const childContactId = resolveContact(child);
        if (!graph.has(childContactId)) graph.set(childContactId, []);

        // Avoid parallel duplicate edges for the same wire segment.
        const alreadyLinked = graph
          .get(contactId)!
          .some(e => e.toId === childContactId && e.elementId === wire.id);

        if (!alreadyLinked) {
          graph.get(contactId)!.push({ toId: childContactId, type: 'wire', elementId: wire.id, active: true });
          graph.get(childContactId)!.push({ toId: contactId, type: 'wire', elementId: wire.id, active: true });
        }

        connectPoint(childId);
      }
    };

    if (wire.rootPointId && wire.points[wire.rootPointId]) {
      connectPoint(wire.rootPointId);
    }
  });

  // ── Step 4: bus switch edges ──────────────────────────────────────────────
  // In the normal case wires connect directly to the bus node (connectedTo = busId),
  // so the bus-switching behaviour is handled entirely by the disabled-bus check in
  // the BFS. Step 4 is only needed for the edge case where two wires end at the
  // same bus position with different connectedTo values.
  nodes.filter(n => n.type === 'bus').forEach(bus => {
    const busIsOn = bus.enabled;
    const connectedContacts: string[] = [];

    wires.forEach(wire => {
      Object.values(wire.points).forEach(point => {
        if (point.x === bus.x && point.y === bus.y) {
          const cId = point.connectedTo;
          if (cId && cId !== bus.id && !connectedContacts.includes(cId)) {
            connectedContacts.push(cId);
          }
        }
      });
    });

    connectedContacts.forEach(cId => {
      if (!graph.has(cId)) return;
      graph.get(bus.id)!.push({ toId: cId, type: 'bus', elementId: bus.id, active: busIsOn });
      graph.get(cId)!.push({ toId: bus.id, type: 'bus', elementId: bus.id, active: busIsOn });
    });

    for (let i = 0; i < connectedContacts.length; i++) {
      for (let j = i + 1; j < connectedContacts.length; j++) {
        const a = connectedContacts[i];
        const b = connectedContacts[j];
        if (graph.has(a) && graph.has(b)) {
          graph.get(a)!.push({ toId: b, type: 'bus', elementId: bus.id, active: busIsOn });
          graph.get(b)!.push({ toId: a, type: 'bus', elementId: bus.id, active: busIsOn });
        }
      }
    }
  });

  return graph;
}

// ─── colour propagation ─────────────────────────────────────────────────────

/**
 * BFS colour-propagation algorithm.
 *
 * Sources are processed in ascending numeric-ID order (P1 > P2 > …).
 * A contact coloured by a higher-priority source blocks lower-priority BFS.
 * A disabled bus node is visited (its incoming wire gets coloured) but BFS does
 * not continue through it — exactly like an open switch.
 */
export function computeColors(
  nodes: Node[],
  graph: CircuitGraph
): ColorAssignment {
  const wireColors = new Map<string, string>();
  const busColors = new Map<string, string>();
  const contactColors = new Map<string, string>();
  const busReach = new Map<string, Set<string>>();

  const enabledSources = nodes
    .filter(n => n.type === 'power' && n.enabled)
    .sort((a, b) => extractIdNumber(a.id) - extractIdNumber(b.id));

  enabledSources.forEach(source => {
    const sourceColor = source.color || COLOR_NEUTRAL;

    // Seed the source's own contact.
    if (!contactColors.has(source.id)) contactColors.set(source.id, sourceColor);

    // ── Reachability BFS (ignores disabled-bus blocking, used for conflict detection) ──
    const rVisited = new Set<string>([source.id]);
    const rQueue: string[] = [source.id];
    while (rQueue.length > 0) {
      const cur = rQueue.shift()!;
      for (const re of graph.get(cur) || []) {
        if (!re.active) continue;
        if (re.type === 'wire') {
          if (!busReach.has(re.elementId)) busReach.set(re.elementId, new Set());
          busReach.get(re.elementId)!.add(source.id);
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

    // ── Main BFS: propagate colour, respect bus-switch behaviour ─────────────
    const queue: string[] = [source.id];
    const visited = new Set<string>([source.id]);

    while (queue.length > 0) {
      const cur = queue.shift()!;

      // A disabled bus is an open switch: colour it (its input wire reaches it)
      // but do not propagate further.
      const maybeBus = nodes.find(n => n.id === cur && n.type === 'bus');
      if (maybeBus && !maybeBus.enabled) continue;

      for (const edge of graph.get(cur) || []) {
        // Inactive bus-type edges (belt-and-suspenders, main check is above).
        if (!edge.active) continue;

        // If the target was already claimed by a higher-priority source, just
        // colour the edge (wire/bus) if not yet coloured, then stop propagating.
        if (contactColors.has(edge.toId)) {
          if (edge.type === 'wire' && !wireColors.has(edge.elementId))
            wireColors.set(edge.elementId, sourceColor);
          if (edge.type === 'bus' && !busColors.has(edge.elementId))
            busColors.set(edge.elementId, sourceColor);
          continue;
        }

        // Colour the edge.
        if (edge.type === 'wire' && !wireColors.has(edge.elementId))
          wireColors.set(edge.elementId, sourceColor);
        if (edge.type === 'bus' && !busColors.has(edge.elementId))
          busColors.set(edge.elementId, sourceColor);

        // Visit the target contact.
        if (!visited.has(edge.toId)) {
          visited.add(edge.toId);
          contactColors.set(edge.toId, sourceColor);

          // If the target is a bus node, also record its bus colour.
          const targetBus = nodes.find(n => n.id === edge.toId && n.type === 'bus');
          if (targetBus && !busColors.has(targetBus.id))
            busColors.set(targetBus.id, sourceColor);

          queue.push(edge.toId);
        }
      }
    }
  });

  // Sync busColors from contactColors for buses reached via wire edges
  // (wire edges don't produce busReach entries but are still valid paths).
  nodes.forEach(node => {
    if (node.type === 'bus' && contactColors.has(node.id) && !busColors.has(node.id)) {
      busColors.set(node.id, contactColors.get(node.id)!);
    }
  });

  // Conflict detection: buses reachable by more than one source.
  const conflictedBuses = new Set<string>();
  for (const [busId, srcs] of busReach.entries()) {
    if (srcs.size > 1) conflictedBuses.add(busId);
  }

  return { wireColors, busColors, contactColors, conflictedBuses, busReach };
}

// ─── main entry point ────────────────────────────────────────────────────────

export function simulateCircuit(nodes: Node[], wires: Wire[]): ColorAssignment {
  console.debug('[simulate] nodes:', nodes.map(n => ({ id: n.id, type: n.type, enabled: n.enabled, color: n.color })));
  console.debug('[simulate] wires:', wires.map(w => ({ id: w.id, pts: Object.values(w.points).map(p => ({ x: p.x, y: p.y, connectedTo: p.connectedTo })) })));
  const graph = buildCircuitGraph(nodes, wires);
  const result = computeColors(nodes, graph);
  console.debug('[simulate] wireColors:', Array.from(result.wireColors.entries()));
  console.debug('[simulate] busColors:', Array.from(result.busColors.entries()));
  return result;
}

// ─── convenience helpers ─────────────────────────────────────────────────────

export function getWireColor(wireId: string, nodes: Node[], wires: Wire[]): string {
  return simulateCircuit(nodes, wires).wireColors.get(wireId) ?? COLOR_NEUTRAL;
}

export function getBusColor(busId: string, nodes: Node[], wires: Wire[]): string {
  const { busColors } = simulateCircuit(nodes, wires);
  return busColors.get(busId) ?? COLOR_NEUTRAL;
}

export function getNodeColor(nodeId: string, nodes: Node[], wires: Wire[]): string {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return COLOR_NEUTRAL;
  if (node.type === 'power') return node.enabled ? node.color ?? COLOR_NEUTRAL : COLOR_NEUTRAL;
  return getBusColor(nodeId, nodes, wires);
}

export function isEnergized(nodeId: string, nodes: Node[], wires: Wire[]): boolean {
  return getNodeColor(nodeId, nodes, wires) !== COLOR_NEUTRAL;
}

export function isWireEnergized(wireId: string, nodes: Node[], wires: Wire[]): boolean {
  return getWireColor(wireId, nodes, wires) !== COLOR_NEUTRAL;
}
