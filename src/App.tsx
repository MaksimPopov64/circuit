import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Mode, Node, Wire, WirePoint, DraggingNodeState, EditingPointState, HoveredElement, PreviewPoint } from './types';
import {
  useIdGenerator,
  useConnectionGraph,
  useCircuitTracer,
  useColorManager,
  usePositionFinder,
  useConflictDetection
} from './hooks';
import { simulateCircuit } from './utils/simulation';
import { getSVGCoordinates } from './utils';
import { calculateDistance } from './utils/grid';
import {
  POWER_COLORS,
  NODE_CLICK_RADIUS,
  NODE_HOVER_RADIUS,
  NODE_SNAP_RADIUS,
  WIRE_STROKE_WIDTH,
  WIRE_STROKE_WIDTH_HOVER,
  WIRE_GLOW_WIDTH,
  COLOR_BEND_POINT,
  COLOR_JUNCTION_POINT,
  PREVIEW_LINE_DASH,
  PREVIEW_LINE_OPACITY,
  SVG_HEIGHT,
  COLOR_BACKGROUND
} from './constants';
import { COLOR_NEUTRAL, COLOR_CONFLICT } from './constants';

const App = () => {
    // State management
    const [mode, setMode] = useState<Mode>('select');
    const [nodes, setNodes] = useState<Node[]>([
        { id: 'P1', type: 'power', x: 50, y: 100, enabled: true, color: POWER_COLORS[0] },
        { id: 'B1', type: 'bus', x: 150, y: 100, enabled: true },
        { id: 'B2', type: 'bus', x: 250, y: 100, enabled: false },
        { id: 'B3', type: 'bus', x: 350, y: 100, enabled: true },
        { id: 'P2', type: 'power', x: 50, y: 200, enabled: false, color: POWER_COLORS[1] },
        { id: 'B4', type: 'bus', x: 150, y: 200, enabled: true },
        { id: 'B5', type: 'bus', x: 250, y: 200, enabled: true },
    ]);
    const [wires, setWires] = useState<Wire[]>([]);
    const [activeWire, setActiveWire] = useState<Wire | null>(null);
    const [currentBranchEndId, setCurrentBranchEndId] = useState<string | null>(null);
    const [hoveredElement, setHoveredElement] = useState<HoveredElement | null>(null);
    const [editingPoint, setEditingPoint] = useState<EditingPointState | null>(null);
    const [draggingNode, setDraggingNode] = useState<DraggingNodeState | null>(null);
    const [previewPoint, setPreviewPoint] = useState<PreviewPoint | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);

    // Custom hooks for ID generation and circuit logic
    const { generateNodeId, generateWireId, generatePointId, resetCounters } = useIdGenerator();
    const connectionGraph = useConnectionGraph(nodes, wires);
    const circuits = useCircuitTracer(nodes, wires, connectionGraph);
    const { getNextPowerColor, getNodeColor, getSegmentColor, simulation } = useColorManager(nodes, circuits, wires);
    const { findNodeAtPosition, findWirePointAtPosition } = usePositionFinder(nodes, wires);

    // Conflict detection with auto-update
    const { conflictBuses } = useConflictDetection(
        nodes,
        circuits,
        useCallback((conflicts) => {
            if (conflicts.size === 0) return;

            setNodes(prev => {
                let changed = false;
                const next = prev.map(node => {
                    if (conflicts.has(node.id) && node.enabled) {
                        changed = true;
                        return { ...node, enabled: false };
                    }
                    return node;
                });
                return changed ? next : prev;
            });
        }, [])
    );

    // Check if a bus can be toggled without creating conflicts
    const canToggleBus = useCallback((busId: string): boolean => {
        const bus = nodes.find(n => n.id === busId);
        if (!bus || bus.type !== 'bus') return true;
        if (bus.enabled) return true;

        // Check if enabling this bus would create a conflict
        for (const circuit of circuits) {
            if (circuit.busIds.has(busId) && circuit.hasConflict) {
                return false; // Would create/extend a conflict
            }
        }
        return true;
    }, [nodes, circuits]);

    const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (editingPoint || draggingNode) return;

        const svg = svgRef.current;
        if (!svg) return;

        try {
            const { x, y } = getSVGCoordinates(svg, e.clientX, e.clientY);

            if (mode === 'add-power' || mode === 'add-bus') {
                const isPower = mode === 'add-power';
                const newId = generateNodeId(isPower ? 'power' : 'bus');
                const nextColor = isPower ? getNextPowerColor() : undefined;

                // If user clicks on an existing wire point we snap the new node to it
                // and update the point's connectedTo so the wire attaches automatically.
                let placeX = x;
                let placeY = y;
                const existingPoint = findWirePointAtPosition(x, y);
                if (existingPoint) {
                    placeX = existingPoint.point.x;
                    placeY = existingPoint.point.y;
                }

                setNodes(prev => [...prev, {
                    id: newId,
                    type: isPower ? 'power' : 'bus',
                    x: placeX,
                    y: placeY,
                    enabled: true,
                    ...(nextColor ? { color: nextColor } : {})
                }]);

                if (existingPoint) {
                    // update the wire point to reference the new node
                    setWires(prev => prev.map(wire => {
                        if (wire.id === existingPoint.wire.id) {
                            const updatedPoints = { ...wire.points };
                            const p = updatedPoints[existingPoint.pointId];
                            if (p) {
                                updatedPoints[existingPoint.pointId] = {
                                    ...p,
                                    connectedTo: newId,
                                    x: placeX,
                                    y: placeY
                                };
                            }
                            return { ...wire, points: updatedPoints };
                        }
                        return wire;
                    }));
                }

                setMode('select');
                return;
            }

            if (mode === 'select') {
                const node = findNodeAtPosition(x, y, NODE_CLICK_RADIUS);
                if (node) {
                    if (node.type === 'bus' && !node.enabled) {
                        if (!canToggleBus(node.id)) {
                            alert('Невозможно включить шину: обнаружен конфликт источников!');
                            return;
                        }
                    }
                    setNodes(prev => prev.map(n =>
                        n.id === node.id ? { ...n, enabled: !n.enabled } : n
                    ));
                }
                return;
            }

            if (mode === 'draw-wire') {
                const node = findNodeAtPosition(x, y, 22);
                const existingPoint = findWirePointAtPosition(x, y);

                let targetPoint: WirePoint;

                if (node) {
                    targetPoint = {
                        id: generatePointId(),
                        x: node.x,
                        y: node.y,
                        type: 'end',
                        connectedTo: node.id,
                        outgoing: [],
                    };
                } else if (existingPoint) {
                    targetPoint = existingPoint.point;
                } else {
                    targetPoint = {
                        id: generatePointId(),
                        x,
                        y,
                        type: 'bend',
                        outgoing: [],
                    };
                }

                if (!activeWire) {
                    const newWire: Wire = {
                        id: generateWireId(),
                        points: { [targetPoint.id]: targetPoint },
                        rootPointId: targetPoint.id,
                        isComplete: false,
                    };
                    setActiveWire(newWire);
                    setCurrentBranchEndId(targetPoint.id);
                    setWires(prev => [...prev, newWire]);
                } else {
                    const prevEndId = currentBranchEndId!;
                    const prevPoint = activeWire.points[prevEndId];

                    if (!prevPoint) return;

                    const updatedPrev = {
                        ...prevPoint,
                        outgoing: [...prevPoint.outgoing, targetPoint.id],
                    };

                    let updatedPoints = { ...activeWire.points };
                    updatedPoints[prevEndId] = updatedPrev;

                    if (!updatedPoints[targetPoint.id]) {
                        updatedPoints[targetPoint.id] = targetPoint;
                    }

                    const updatedWire = {
                        ...activeWire,
                        points: updatedPoints,
                    };

                    setActiveWire(updatedWire);
                    setWires(prev => prev.map(w => w.id === activeWire.id ? updatedWire : w));

                    if (e.detail === 2 || node) {
                        setActiveWire(null);
                        setCurrentBranchEndId(null);
                        setPreviewPoint(null);
                    } else {
                        setCurrentBranchEndId(targetPoint.id);
                    }
                }
            }
        } catch (error) {
            console.error('[App] Error in handleCanvasClick:', error);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg) return;

        try {
            const { x, y } = getSVGCoordinates(svg, e.clientX, e.clientY);

            // Обновляем preview point для активного провода
            if (activeWire && currentBranchEndId && mode === 'draw-wire') {
                setPreviewPoint({ x, y });
            } else {
                setPreviewPoint(null);
            }

            // Перетаскивание узла
            if (draggingNode) {
                const newX = x - draggingNode.offsetX;
                const newY = y - draggingNode.offsetY;

                setNodes(prev => prev.map(node => {
                    if (node.id === draggingNode.id) {
                        return {
                            ...node,
                            x: newX,
                            y: newY
                        };
                    }
                    return node;
                }));

                // Обновляем точки провода, которые привязаны к этому узлу
                // и если узел пододвинулся вплотную к не подключённой точке конца,
                // автоматически соединяем
                setWires(prev => prev.map(wire => {
                    const updatedPoints = { ...wire.points };
                    let changed = false;

                    Object.values(updatedPoints).forEach(point => {
                        if (point.connectedTo === draggingNode.id) {
                            point.x = newX;
                            point.y = newY;
                            changed = true;
                        } else if (point.type === 'end' && !point.connectedTo) {
                            // если точка конца попала в радиус привязки к узлу, "прилипать"
                            if (calculateDistance(point.x, point.y, newX, newY) <= NODE_SNAP_RADIUS) {
                                point.connectedTo = draggingNode.id;
                                point.x = newX;
                                point.y = newY;
                                changed = true;
                            }
                        }
                    });

                    return changed ? { ...wire, points: updatedPoints } : wire;
                }));
                return;
            }

            // Перетаскивание точки (bend/junction/end)
            if (editingPoint) {
                const { wireId, pointId } = editingPoint;
                setWires(prev => prev.map(wire => {
                    if (wire.id === wireId && wire.points[pointId]) {
                        const updatedPoints = { ...wire.points };
                        const point = updatedPoints[pointId];
                        if (point) {
                            // перемещаем
                            updatedPoints[pointId] = {
                                ...point,
                                x,
                                y
                            };

                            // для конца проверяем привязку к узлу
                            if (point.type === 'end') {
                                const nodeHit = findNodeAtPosition(x, y);
                                if (nodeHit) {
                                    updatedPoints[pointId].connectedTo = nodeHit.id;
                                    updatedPoints[pointId].x = nodeHit.x;
                                    updatedPoints[pointId].y = nodeHit.y;
                                } else {
                                    // если больше не над узлом, отсоединяем
                                    if (updatedPoints[pointId].connectedTo) {
                                        updatedPoints[pointId].connectedTo = undefined;
                                    }
                                }
                            }
                        }
                        return { ...wire, points: updatedPoints };
                    }
                    return wire;
                }));
                return;
            }

            // Подсветка элементов
            const node = findNodeAtPosition(x, y, NODE_HOVER_RADIUS);
            if (node) {
                setHoveredElement({ type: 'node', id: node.id });
            } else {
                const pointHit = findWirePointAtPosition(x, y);
                if (pointHit) {
                    setHoveredElement({ type: 'wire', id: pointHit.wire.id });
                } else {
                    setHoveredElement(null);
                }
            }
        } catch (error) {
            console.error('[App] Error in handleMouseMove:', error);
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        if (mode !== 'select') return;

        const svg = svgRef.current;
        if (!svg) return;

        try {
            const { x: svgX, y: svgY } = getSVGCoordinates(svg, e.clientX, e.clientY);

            const node = nodes.find(n => n.id === nodeId);
            if (!node) return;

            setDraggingNode({
                id: nodeId,
                offsetX: svgX - node.x,
                offsetY: svgY - node.y
            });
        } catch (error) {
            console.error('[App] Error in handleNodeMouseDown:', error);
        }
    };

    const handlePointMouseDown = (e: React.MouseEvent, wireId: string, pointId: string) => {
        e.stopPropagation();
        if (mode !== 'select') return;

        const wire = wires.find(w => w.id === wireId);
        const point = wire?.points[pointId];
        // allow dragging any point type (bend, junction, end)
        if (point && (point.type === 'bend' || point.type === 'junction' || point.type === 'end')) {
            setEditingPoint({ wireId, pointId });
        }
    };

    const handleMouseUp = () => {
        setDraggingNode(null);
        setEditingPoint(null);
    };

    const handleMouseLeave = () => {
        handleMouseUp();
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeWire) {
                    setWires(prev => prev.map(w =>
                        w.id === activeWire.id ? { ...w, isComplete: true } : w
                    ));
                    setActiveWire(null);
                    setCurrentBranchEndId(null);
                    setPreviewPoint(null);
                    setMode('select');
                }
                if (editingPoint || draggingNode) {
                    setEditingPoint(null);
                    setDraggingNode(null);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeWire, editingPoint, draggingNode]);

    // Auto-disable power sources that are energized by a higher-priority source
    useEffect(() => {
        if (!simulation || !simulation.contactColors) return;

        const toDisable = new Set<string>();
        nodes.forEach(node => {
            if (node.type === 'power' && node.enabled) {
                const color = simulation.contactColors.get(node.id);
                if (color && node.color && color !== node.color) {
                    toDisable.add(node.id);
                }
            }
        });

        if (toDisable.size === 0) return;

        setNodes(prev => {
            let changed = false;
            const next = prev.map(n => {
                if (toDisable.has(n.id) && n.enabled) {
                    changed = true;
                    return { ...n, enabled: false };
                }
                return n;
            });
            return changed ? next : prev;
        });
    }, [simulation, nodes]);

    const handleModeChange = (newMode: Mode) => {
        if (activeWire && newMode !== 'draw-wire') {
            setWires(prev => prev.map(w =>
                w.id === activeWire.id ? { ...w, isComplete: true } : w
            ));
            setActiveWire(null);
            setCurrentBranchEndId(null);
            setPreviewPoint(null);
        }
        if (draggingNode || editingPoint) {
            setDraggingNode(null);
            setEditingPoint(null);
        }
        setMode(newMode);
    };

    const clearAll = () => {
        if (window.confirm('Очистить всю схему?')) {
            setNodes([]);
            setWires([]);
            setActiveWire(null);
            setCurrentBranchEndId(null);
            setPreviewPoint(null);
            resetCounters();
        }
    };

    const renderWire = (wire: Wire) => {
        const elements: React.ReactNode[] = [];
        const drawnSegments = new Set<string>();
        const isHovered = hoveredElement?.type === 'wire' && hoveredElement.id === wire.id;

        const drawFrom = (pointId: string) => {
            const p = wire.points[pointId];
            if (!p) return;

            p.outgoing.forEach(childId => {
                const key = [pointId, childId].sort().join('-');
                if (drawnSegments.has(key)) return;
                drawnSegments.add(key);

                const child = wire.points[childId];
                if (!child) return;

                const segmentColor = getSegmentColor(p, child, wires);

                elements.push(
                    <line
                        key={`seg-${key}`}
                        x1={p.x}
                        y1={p.y}
                        x2={child.x}
                        y2={child.y}
                        stroke={segmentColor}
                        strokeWidth={isHovered ? WIRE_STROKE_WIDTH_HOVER : WIRE_STROKE_WIDTH}
                        strokeLinecap="round"
                        className={segmentColor !== COLOR_NEUTRAL && segmentColor !== COLOR_CONFLICT ? 'wire-seg energized' : 'wire-seg'}
                    />
                );

                if (segmentColor !== '#808080' && segmentColor !== '#ff0000') {
                    elements.push(
                        <line
                            key={`glow-${key}`}
                            x1={p.x}
                            y1={p.y}
                            x2={child.x}
                            y2={child.y}
                            stroke={segmentColor}
                            strokeWidth={WIRE_GLOW_WIDTH}
                            opacity={0.3}
                            strokeLinecap="round"
                        />
                    );
                }

                drawFrom(childId);
            });
        };

        drawFrom(wire.rootPointId);

        // Отрисовка точек
        Object.values(wire.points).forEach(point => {
            if (point.type === 'bend') {
                elements.push(
                    <circle
                        key={`point-${point.id}`}
                        cx={point.x}
                        cy={point.y}
                        r="5"
                        fill={COLOR_BEND_POINT}
                        stroke="#333"
                        strokeWidth="2"
                        style={{ cursor: 'move' }}
                        onMouseDown={(e) => handlePointMouseDown(e, wire.id, point.id)}
                    />
                );
            } else if (point.type === 'junction') {
                // contact id for junctions uses the same naming as buildCircuitGraph
                const contactId = point.connectedTo || `junction_${point.x}_${point.y}`;
                const junctionColor = simulation && simulation.contactColors ? (simulation.contactColors.get(contactId) || COLOR_JUNCTION_POINT) : COLOR_JUNCTION_POINT;
                elements.push(
                    <circle
                        key={`point-${point.id}`}
                        cx={point.x}
                        cy={point.y}
                        r="6"
                        fill={junctionColor}
                        stroke="#333"
                        strokeWidth="2"
                        onMouseDown={(e) => handlePointMouseDown(e, wire.id, point.id)}
                    />
                );
            } else if (point.type === 'end') {
                const nodeColor = point.connectedTo ? getNodeColor(point.connectedTo) : '#FF6B6B';
                elements.push(
                    <circle
                        key={`point-${point.id}`}
                        cx={point.x}
                        cy={point.y}
                        r="6"
                        fill={nodeColor}
                        stroke="#333"
                        strokeWidth="2"
                    />
                );
            }
        });

        return <g key={wire.id}>{elements}</g>;
    };

    // Preview line для активного провода
    const renderPreviewLine = () => {
        if (!activeWire || !currentBranchEndId || !previewPoint) return null;

        const currentPoint = activeWire.points[currentBranchEndId];
        if (!currentPoint) return null;

        return (
            <line
                x1={currentPoint.x}
                y1={currentPoint.y}
                x2={previewPoint.x}
                y2={previewPoint.y}
                stroke="#FFD700"
                strokeWidth="2"
                strokeDasharray={PREVIEW_LINE_DASH}
                opacity={PREVIEW_LINE_OPACITY}
                pointerEvents="none"
            />
        );
    };

    return (
        <div style={{
            padding: '20px',
            backgroundColor: '#1a1a1a',
            minHeight: '100vh',
            fontFamily: 'Arial, sans-serif'
        }}>
            <h1 style={{ color: 'white', marginBottom: '20px' }}>⚡ Схема электросети</h1>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '20px'
            }}>
                <div style={{ color: 'white', fontWeight: 'bold' }}>
                    Режим: {mode === 'select' && 'Выбор'}
                    {mode === 'add-power' && 'Добавление источника'}
                    {mode === 'add-bus' && 'Добавление шины'}
                    {mode === 'draw-wire' && 'Рисование провода'}
                    {activeWire && ' (ESC для завершения)'}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => handleModeChange('select')}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: mode === 'select' ? '#4CAF50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        ✨ Выбор
                    </button>
                    <button
                        onClick={() => {
                            // Load example scenario: two sources -> disabled bus -> output bus
                            const p1 = generateNodeId('power');
                            const p2 = generateNodeId('power');
                            const b1 = generateNodeId('bus');
                            const b2 = generateNodeId('bus');

                            const nodeList = [
                                { id: p1, type: 'power' as const, x: 50, y: 100, enabled: true, color: POWER_COLORS[0] },
                                { id: p2, type: 'power' as const, x: 50, y: 200, enabled: true, color: POWER_COLORS[1] },
                                { id: b1, type: 'bus' as const, x: 200, y: 150, enabled: false },
                                { id: b2, type: 'bus' as const, x: 350, y: 150, enabled: true }
                            ];

                            const w1p1 = generatePointId();
                            const w1p2 = generatePointId();
                            const w2p1 = generatePointId();
                            const w2p2 = generatePointId();
                            const w3p1 = generatePointId();
                            const w3p2 = generatePointId();

                            const w1 = {
                                id: generateWireId(),
                                points: {
                                    [w1p1]: { id: w1p1, x: 50, y: 100, type: 'end' as const, connectedTo: p1, outgoing: [w1p2] },
                                    [w1p2]: { id: w1p2, x: 200, y: 150, type: 'end' as const, connectedTo: b1, outgoing: [] }
                                },
                                rootPointId: w1p1,
                                isComplete: true
                            };

                            const w2 = {
                                id: generateWireId(),
                                points: {
                                    [w2p1]: { id: w2p1, x: 50, y: 200, type: 'end' as const, connectedTo: p2, outgoing: [w2p2] },
                                    [w2p2]: { id: w2p2, x: 200, y: 150, type: 'end' as const, connectedTo: b1, outgoing: [] }
                                },
                                rootPointId: w2p1,
                                isComplete: true
                            };

                            const w3 = {
                                id: generateWireId(),
                                points: {
                                    [w3p1]: { id: w3p1, x: 200, y: 150, type: 'end' as const, connectedTo: b1, outgoing: [w3p2] },
                                    [w3p2]: { id: w3p2, x: 350, y: 150, type: 'end' as const, connectedTo: b2, outgoing: [] }
                                },
                                rootPointId: w3p1,
                                isComplete: true
                            };

                            setNodes(nodeList);
                            setWires([w1, w2, w3]);

                            // Run simulation and assert expected behavior
                            const result = simulateCircuit(nodeList, [w1, w2, w3]);
                            console.log('Example scenario simulation:', result);

                            // Expectation: w1 and w2 energized with their respective source colors; w3 (after disabled bus b1) should be neutral
                            const w1Color = result.wireColors.get(w1.id) || '#808080';
                            const w2Color = result.wireColors.get(w2.id) || '#808080';
                            const w3Color = result.wireColors.get(w3.id) || '#808080';

                            const ok = w1Color === nodeList[0].color && w2Color === nodeList[1].color && w3Color === '#808080';
                            console.log(`w1:${w1.id}=${w1Color}, w2:${w2.id}=${w2Color}, w3:${w3.id}=${w3Color}`);
                            if (ok) {
                                console.log('Example check: PASS — bus disabled blocks downstream wires');
                            } else {
                                console.warn('Example check: FAIL — unexpected coloring');
                                alert('Example check FAILED — see console for details');
                            }
                        }}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        📘 Load example
                    </button>
                    <button
                        onClick={() => handleModeChange('add-power')}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: mode === 'add-power' ? '#4CAF50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🔋 Добавить источник
                    </button>
                    <button
                        onClick={() => handleModeChange('add-bus')}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: mode === 'add-bus' ? '#4CAF50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🔌 Добавить шину
                    </button>
                    <button
                        onClick={() => handleModeChange('draw-wire')}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: mode === 'draw-wire' ? '#4CAF50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🔗 Рисовать провод
                    </button>
                    <button
                        onClick={clearAll}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginLeft: 'auto'
                        }}
                    >
                        🗑️ Очистить всё
                    </button>
                </div>
            </div>

            {conflictBuses.size > 0 && (
                <div style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#ff4444',
                    color: 'white',
                    borderRadius: '8px'
                }}>
                    <h3 style={{ marginTop: 0 }}>⚠️ Обнаружены конфликты источников!</h3>
                    <p>Следующие шины автоматически выключены из-за конфликта:</p>
                    <ul style={{ margin: 0 }}>
                        {Array.from(conflictBuses.entries()).map(([busId, sources]) => (
                            <li key={busId}>
                                <strong>{busId}</strong>: конфликт между {Array.from(sources).join(', ')}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ position: 'relative' }}>
                <svg
                    ref={svgRef}
                    width="100%"
                    height={SVG_HEIGHT}
                    style={{
                        backgroundColor: COLOR_BACKGROUND,
                        borderRadius: '8px',
                        cursor: editingPoint || draggingNode ? 'grabbing' :
                            (mode === 'draw-wire' ? 'crosshair' :
                                (mode === 'add-power' || mode === 'add-bus' ? 'copy' : 'default'))
                    }}
                    onClick={handleCanvasClick}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                >
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#3a3a3a" strokeWidth="1" />
                        </pattern>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Рендерим провода */}
                    {wires.map(renderWire)}

                    {/* Preview line */}
                    {renderPreviewLine()}

                    {/* Рендерим узлы */}
                    {nodes.map(node => {
                        const isHovered = hoveredElement?.type === 'node' && hoveredElement.id === node.id;
                        const nodeColor = getNodeColor(node.id);
                        const isActive = node.enabled && nodeColor !== '#808080' && nodeColor !== '#ff0000';

                        return (
                            <g key={node.id}>
                                {/* Свечение для активных узлов */}
                                {isActive && (
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={node.type === 'power' ? 30 : 20}
                                        fill={nodeColor}
                                        opacity={0.3}
                                        filter="url(#glow)"
                                    />
                                )}

                                {node.type === 'power' ? (
                                    <polygon
                                        points={`
                                            ${node.x - 20},${node.y - 15}
                                            ${node.x + 20},${node.y - 15}
                                            ${node.x + 25},${node.y}
                                            ${node.x + 20},${node.y + 15}
                                            ${node.x - 20},${node.y + 15}
                                            ${node.x - 25},${node.y}
                                        `}
                                        fill={nodeColor}
                                        stroke={isHovered ? "yellow" : "#333"}
                                        strokeWidth={isHovered ? "3" : "2"}
                                        cursor="pointer"
                                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                    />
                                ) : (
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={isHovered ? 18 : 15}
                                        fill={nodeColor}
                                        stroke={isHovered ? "yellow" : "#333"}
                                        strokeWidth={isHovered ? "3" : "2"}
                                        cursor="pointer"
                                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                    />
                                )}

                                <text
                                    x={node.x}
                                    y={node.y + (node.type === 'power' ? 35 : 35)}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize="12"
                                    fontWeight="bold"
                                    style={{ userSelect: 'none' }}
                                >
                                    {node.id}
                                </text>

                                {!node.enabled && (
                                    <text
                                        x={node.x}
                                        y={node.y}
                                        textAnchor="middle"
                                        fill="white"
                                        fontSize="16"
                                        fontWeight="bold"
                                        style={{ userSelect: 'none' }}
                                    >
                                        ✕
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>

                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px',
                    fontSize: '12px'
                }}>
                    <div><strong>Статистика:</strong></div>
                    <div>Источники: {nodes.filter(n => n.type === 'power').length}
                        ({nodes.filter(n => n.type === 'power' && n.enabled).length} вкл)</div>
                    <div>Шины: {nodes.filter(n => n.type === 'bus').length}
                        ({nodes.filter(n => n.type === 'bus' && n.enabled).length} вкл)</div>
                    <div>Провода: {wires.length}</div>
                </div>
            </div>

            <div style={{
                marginTop: '20px',
                color: 'white',
                padding: '15px',
                backgroundColor: '#2a2a2a',
                borderRadius: '8px'
            }}>
                <h3>📖 Инструкции:</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <h4>🎨 Цветовая схема:</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>Каждый источник имеет уникальный цвет</li>
                            <li>Активные провода показывают цвет источника</li>
                            <li>Серый = нет питания</li>
                            <li>Красный = конфликт источников</li>
                            <li>Свечение = активное питание</li>
                        </ul>
                    </div>
                    <div>
                        <h4>⚡ Управление:</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                            <li>Клик на узел = вкл/выкл</li>
                            <li>Перетащите узел для перемещения</li>
                            <li>Перетащите точку изгиба для изменения формы</li>
                            <li>Двойной клик = завершить провод</li>
                            <li>ESC = отмена действия</li>
                            <li>Привязка к сетке 10×10 пикселей</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;