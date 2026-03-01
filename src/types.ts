// src/types.ts
export interface Node {
  id: string;
  type: 'power' | 'bus';
  x: number;
  y: number;
  enabled: boolean;
  color?: string;
}

export interface WirePoint {
  id: string;
  x: number;
  y: number;
  type: 'end' | 'bend' | 'junction';
  connectedTo?: string;
  outgoing: string[];
}

export interface Wire {
  id: string;
  points: Record<string, WirePoint>;
  rootPointId: string;
  isComplete: boolean;
}

export type Mode = 'select' | 'add-power' | 'add-bus' | 'draw-wire';

export interface DraggingNodeState {
  id: string;
  offsetX: number;
  offsetY: number;
}

export interface EditingPointState {
  wireId: string;
  pointId: string;
}

export interface HoveredElement {
  type: 'node' | 'wire';
  id: string;
}

export interface PreviewPoint {
  x: number;
  y: number;
}

export interface FindWirePointResult {
  wire: Wire;
  point: WirePoint;
  pointId: string;
}
