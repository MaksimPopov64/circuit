// src/hooks/index.ts
export { useIdGenerator } from './useIdGenerator';
export { useConnectionGraph, useCircuitTracer } from './useConnectionGraph';
export { useComponentColor, useWireColor, useNodeSources } from './useSourceFinder';
export { useColorManager } from './useColorManager';
export { usePositionFinder } from './usePositionFinder';
export { useConflictDetection } from './useConflictDetection';

// Export simulation utilities
export { simulateCircuit, computeColors, buildCircuitGraph } from '../utils/simulation';
