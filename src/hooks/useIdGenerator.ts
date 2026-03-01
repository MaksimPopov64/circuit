// src/hooks/useIdGenerator.ts
import { useCallback, useRef } from 'react';

export const useIdGenerator = () => {
  const countersRef = useRef({
    nodeId: 10,
    wireId: 1,
    pointId: 1
  });

  const generateNodeId = useCallback((type: 'power' | 'bus'): string => {
    const prefix = type === 'power' ? 'P' : 'B';
    return `${prefix}${countersRef.current.nodeId++}`;
  }, []);

  const generateWireId = useCallback((): string => {
    return `W${countersRef.current.wireId++}`;
  }, []);

  const generatePointId = useCallback((): string => {
    return `PT${countersRef.current.pointId++}`;
  }, []);

  const resetCounters = useCallback(() => {
    countersRef.current = { nodeId: 10, wireId: 1, pointId: 1 };
  }, []);

  return {
    generateNodeId,
    generateWireId,
    generatePointId,
    resetCounters
  };
};
