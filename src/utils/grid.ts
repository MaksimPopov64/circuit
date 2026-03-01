// src/utils/grid.ts
import { GRID_SIZE } from '../constants';

export const snapToGrid = (value: number): number => {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
};

export const getSVGCoordinates = (
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } => {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  
  if (!ctm) {
    throw new Error('Failed to get screen CTM from SVG');
  }
  
  const svgPoint = point.matrixTransform(ctm.inverse());
  
  return {
    x: snapToGrid(svgPoint.x),
    y: snapToGrid(svgPoint.y)
  };
};

export const calculateDistance = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};
