import React, { useState, useMemo, useCallback, useEffect } from 'react';

interface Node {
    id: string;
    type: 'power' | 'bus';
    x: number;
    y: number;
    enabled: boolean;
    color?: string;
}

interface Connection {
    id: string;
    from: string;
    to: string;
}

// Палитра цветов для источников (кроме красного)
const POWER_COLORS = [
    '#00FF00', // Зеленый
    '#0000FF', // Синий
    '#FFFF00', // Желтый
    '#FF00FF', // Пурпурный
    '#00FFFF', // Бирюзовый
    '#FF8800', // Оранжевый
    '#8800FF', // Фиолетовый
    '#008800', // Темно-зеленый
    '#0088FF', // Голубой
    '#FF00AA', // Розовый
];

let nextNodeId = 10;
let nextConnectionId = 7;

const generateNodeId = (type: 'power' | 'bus') => {
    return `${type === 'power' ? 'P' : 'B'}${nextNodeId++}`;
};

const generateConnectionId = () => {
    return `C${nextConnectionId++}`;
};

const App = () => {
    const [mode, setMode] = useState<'select' | 'add-power' | 'add-bus' | 'add-connection'>('select');
    const [nodes, setNodes] = useState<Node[]>([
        { id: 'P1', type: 'power', x: 50, y: 100, enabled: true, color: POWER_COLORS[0] },
        { id: 'B1', type: 'bus', x: 150, y: 100, enabled: true },
        { id: 'B2', type: 'bus', x: 250, y: 100, enabled: false },
        { id: 'B3', type: 'bus', x: 350, y: 100, enabled: true },
        { id: 'P2', type: 'power', x: 50, y: 200, enabled: false, color: POWER_COLORS[1] },
        { id: 'B4', type: 'bus', x: 150, y: 200, enabled: true },
        { id: 'B5', type: 'bus', x: 250, y: 200, enabled: true },
    ]);
    const [connections, setConnections] = useState<Connection[]>([
        { id: 'C1', from: 'P1', to: 'B1' },
        { id: 'C2', from: 'B1', to: 'B2' },
        { id: 'C3', from: 'B2', to: 'B3' },
        { id: 'C4', from: 'P2', to: 'B4' },
        { id: 'C5', from: 'B4', to: 'B5' },
    ]);
    const [drawingConnection, setDrawingConnection] = useState<{
        from: string;
        currentX: number;
        currentY: number;
    } | null>(null);
    const [draggingNode, setDraggingNode] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const getNextPowerColor = useCallback(() => {
        const powerCount = nodes.filter(n => n.type === 'power').length;
        return POWER_COLORS[powerCount % POWER_COLORS.length];
    }, [nodes]);

        // Обработка сообщений от Electron
    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onNewCircuit(() => {
                clearAll();
            });
            
            window.electronAPI.onClearAll(() => {
                clearAll();
            });
            
            window.electronAPI.onSetMode((event, mode: any) => {
                setMode(mode);
            });           
          
        }
    }, []);

    // Функция для поиска всех источников в цепи узла
    const findSourcesForNode = useCallback((nodeId: string, visited: Set<string> = new Set()): Set<string> => {
        if (visited.has(nodeId)) return new Set();
        visited.add(nodeId);

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return new Set();

        // Если это выключенная шина - прерываем поиск в этом направлении
        if (node.type === 'bus' && !node.enabled) {
            return new Set();
        }

        const sources = new Set<string>();

        // Если это включенный источник
        if (node.type === 'power' && node.enabled) {
            sources.add(nodeId);
            return sources;
        }

        // Ищем источники среди узлов, которые соединены с текущим (в обратном направлении)
        const incomingConnections = connections.filter(c => c.to === nodeId);
        const outgoingConnections = connections.filter(c => c.from === nodeId);
        for (const conn of incomingConnections) {
            const fromSources = findSourcesForNode(conn.from, visited);
            fromSources.forEach(source => sources.add(source));
        }
        for (const conn of outgoingConnections) {
            const fromSources = findSourcesForNode(conn.to, visited);
            fromSources.forEach(source => sources.add(source));
        }

        return sources;
    }, [nodes, connections]);

    // Автоматическое выключение шин при конфликте
    useEffect(() => {
        const conflicts = new Map<string, Set<string>>();
        const nodesToDisable = new Set<string>();

        // Находим все шины с конфликтом
        nodes.forEach(node => {
            if (node.type === 'bus' && node.enabled) {
                const sources = findSourcesForNode(node.id);
                if (sources.size > 1) {
                    conflicts.set(node.id, sources);
                    nodesToDisable.add(node.id);
                }
            }
        });

        // Если есть конфликты, отключаем шины
        if (nodesToDisable.size > 0) {
            setNodes(prev => prev.map(node =>
                nodesToDisable.has(node.id)
                    ? { ...node, enabled: false }
                    : node
            ));
        }
    }, [nodes, connections, findSourcesForNode]);

    // Функция для проверки, можно ли включить шину
    const canToggleBus = useCallback((busId: string): boolean => {
        const bus = nodes.find(n => n.id === busId);
        if (!bus || bus.type !== 'bus') return true;

        // Если шина уже включена, ее можно выключить в любой момент
        if (bus.enabled) return true;

        // Находим все источники, которые будут питать эту шину после включения
        const tempBus = { ...bus, enabled: true };
        const tempNodes = nodes.map(n => n.id === busId ? tempBus : n);

        // Функция для поиска источников с учетом выключенных шин
        const findSourcesTemp = (nodeId: string, visited: Set<string> = new Set()): Set<string> => {
            if (visited.has(nodeId)) return new Set();
            visited.add(nodeId);

            const node = tempNodes.find(n => n.id === nodeId);
            if (!node) return new Set();

            // Если это выключенная шина - прерываем поиск в этом направлении
            if (node.type === 'bus' && !node.enabled) {
                return new Set();
            }

            const sources = new Set<string>();

            // Если это включенный источник - добавляем его
            if (node.type === 'power' && node.enabled) {
                sources.add(nodeId);
                return sources;
            }

            // Ищем источники среди входящих соединений
            const incomingConnections = connections.filter(c => c.to === nodeId);
            for (const conn of incomingConnections) {
                const fromSources = findSourcesTemp(conn.from, visited);
                fromSources.forEach(source => sources.add(source));
            }

            return sources;
        };

        const sources = findSourcesTemp(busId);
        return sources.size <= 1; // Можно включить только если будет не более одного источника
    }, [nodes, connections]);

    // Функция для получения цвета узла
    const getNodeColor = useCallback((nodeId: string): string => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return '#808080';

        // Выключенные узлы
        if (!node.enabled) {
            return node.type === 'power' ? '#808080' : '#ff0000'; // Красный для выключенных шин
        }

        // Включенные источники показывают свой цвет
        if (node.type === 'power') {
            return node.color || '#808080';
        }

        // Для шины находим все активные источники
        const sources = findSourcesForNode(nodeId);

        if (sources.size === 0) {
            return '#808080'; // Нет активных источников
        }

        if (sources.size === 1) {
            const sourceId = Array.from(sources)[0];
            const source = nodes.find(n => n.id === sourceId);
            return source?.color || '#808080';
        }

        // Если несколько источников (конфликт) - шина будет выключена автоматически
        return '#808080';
    }, [nodes, findSourcesForNode]);

    // Функция для получения цвета линии
    const getLineColor = useCallback((fromId: string, toId: string): string => {
        const fromNode = nodes.find(n => n.id === fromId);
        const toNode = nodes.find(n => n.id === toId);

        if (!fromNode || !toNode) return '#808080';

        // Находим все источники для каждого конца линии
        const fromSources = findSourcesForNode(fromId);
        const toSources = findSourcesForNode(toId);

        // Если оба узла активны (имеют источники)
        if (fromSources.size > 0 && toSources.size > 0) {
            // Если источники разные - конфликт, выбираем цвет ближайшего источника к начальному узлу
            const fromSourceId = Array.from(fromSources)[0];
            const toSourceId = Array.from(toSources)[0];

            if (fromSourceId === toSourceId) {
                // Один источник на обоих концах
                const source = nodes.find(n => n.id === fromSourceId);
                return source?.color || '#808080';
            } else {
                // Разные источники - серая линия (конфликт)
                return '#808080';
            }
        }

        // Если один из узлов активен
        if (fromSources.size > 0) {
            const sourceId = Array.from(fromSources)[0];
            const source = nodes.find(n => n.id === sourceId);
            return source?.color || '#808080';
        }

        if (toSources.size > 0) {
            const sourceId = Array.from(toSources)[0];
            const source = nodes.find(n => n.id === sourceId);
            return source?.color || '#808080';
        }

        // Оба узла неактивны
        return '#808080';
    }, [nodes, findSourcesForNode]);

    // Функция для проверки, активна ли линия (не серая)
    const isLineActive = useCallback((fromId: string, toId: string): boolean => {
        const color = getLineColor(fromId, toId);
        return color !== '#808080';
    }, [getLineColor]);

    const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
        const svg = e.currentTarget;
        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());

        const x = Math.round(svgPoint.x);
        const y = Math.round(svgPoint.y);

        if (mode === 'add-power') {
            const newId = generateNodeId('power');
            const nextColor = getNextPowerColor();
            setNodes(prev => [...prev, {
                id: newId,
                type: 'power',
                x,
                y,
                enabled: true,
                color: nextColor
            }]);
            setMode('select');
        } else if (mode === 'add-bus') {
            const newId = generateNodeId('bus');
            setNodes(prev => [...prev, {
                id: newId,
                type: 'bus',
                x,
                y,
                enabled: true
            }]);
            setMode('select');
        } else if (mode === 'add-connection') {
            const clickedNode = nodes.find(node => {
                const dx = x - node.x;
                const dy = y - node.y;
                return Math.sqrt(dx * dx + dy * dy) <= 20;
            });

            if (clickedNode) {
                if (!drawingConnection) {
                    setDrawingConnection({
                        from: clickedNode.id,
                        currentX: x,
                        currentY: y
                    });
                } else {
                    const newId = generateConnectionId();
                    setConnections(prev => [...prev, {
                        id: newId,
                        from: drawingConnection.from,
                        to: clickedNode.id
                    }]);
                    setDrawingConnection(null);
                    setMode('select');
                }
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const svg = e.currentTarget;
        const point = svg.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());

        const x = Math.round(svgPoint.x);
        const y = Math.round(svgPoint.y);

        if (draggingNode) {
            setNodes(prev => prev.map(node =>
                node.id === draggingNode
                    ? { ...node, x: x - dragOffset.x, y: y - dragOffset.y }
                    : node
            ));
        }

        if (drawingConnection) {
            setDrawingConnection(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            setDraggingNode(nodeId);
            const svg = e.currentTarget.closest('svg');
            if (svg) {
                const point = svg.createSVGPoint();
                point.x = e.clientX;
                point.y = e.clientY;
                const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
                setDragOffset({
                    x: svgPoint.x - node.x,
                    y: svgPoint.y - node.y
                });
            }
        }
    };

    const handleMouseUp = () => {
        setDraggingNode(null);
    };

    const toggleNode = (nodeId: string) => {
        if (mode === 'select') {
            const node = nodes.find(n => n.id === nodeId);

            if (!node) return;

            // Для шин проверяем, можно ли их включить
            if (node.type === 'bus' && !node.enabled) {
                if (!canToggleBus(nodeId)) {
                    alert('Невозможно включить шину: обнаружен конфликт источников!');
                    return;
                }
            }

            setNodes(prev => prev.map(node =>
                node.id === nodeId
                    ? { ...node, enabled: !node.enabled }
                    : node
            ));
        }
    };
   

    const clearAll = () => {
        if (window.confirm('Очистить всю схему?')) {
            setNodes([]);
            setConnections([]);
            nextNodeId = 1;
            nextConnectionId = 1;
        }
    };

    // Находим все шины с конфликтом для отображения
    const conflictBuses = useMemo(() => {
        const conflicts = new Map<string, Set<string>>();

        nodes.forEach(node => {
            if (node.type === 'bus' && node.enabled) {
                const sources = findSourcesForNode(node.id);
                if (sources.size > 1) {
                    conflicts.set(node.id, sources);
                }
            }
        });

        return conflicts;
    }, [nodes, findSourcesForNode]);

    // Считаем активные линии
    const activeLines = useMemo(() => {
        return connections.filter(conn => isLineActive(conn.from, conn.to)).length;
    }, [connections, isLineActive]);

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
                marginBottom: '20px',
                flexWrap: 'wrap',
                alignItems: 'center'
            }}>
                <div style={{ color: 'white', fontWeight: 'bold', marginRight: '10px',  justifyContent: 'flex-start', }}>
                    Режим:
                    {mode === 'select' && ' Выбор'}
                    {mode === 'add-power' && ' Добавление источника'}
                    {mode === 'add-bus' && ' Добавление шины'}
                    {mode === 'add-connection' && ' Рисование соединения'}
                </div>
                <article style={{ justifyContent: 'flex-start', display: 'flex', width: '100%', gap: '8px'}}>
                    <button
                        onClick={() => setMode('select')}
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
                        onClick={() => setMode('add-power')}
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
                        onClick={() => setMode('add-bus')}
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
                        onClick={() => setMode('add-connection')}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: mode === 'add-connection' ? '#4CAF50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🔗 Нарисовать соединение
                    </button>
                    <button
                        onClick={clearAll}
                        style={{
                            padding: '10px 15px',
                            backgroundColor: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🗑️ Очистить всё
                    </button>
                </article>
            </div>


            {/* Статистика */}
            <div style={{
                color: 'white',
                marginBottom: '20px',
                padding: '15px',
                backgroundColor: '#2a2a2a',
                borderRadius: '4px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px'
            }}>
                <div>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Всего узлов:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{nodes.length}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Источников:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFD700' }}>
                        {nodes.filter(n => n.type === 'power').length}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Шин:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#00BFFF' }}>
                        {nodes.filter(n => n.type === 'bus').length}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Соединений:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{connections.length}</div>
                </div>
                <div>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Активных линий:</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4CAF50' }}>
                        {activeLines}
                    </div>
                </div>
            </div>

            {/* Информация о конфликтах */}
            {conflictBuses.size > 0 && (
                <div style={{
                    marginBottom: '20px',
                    padding: '15px',
                    backgroundColor: '#ff4444',
                    color: 'white',
                    borderRadius: '8px'
                }}>
                    <h3 style={{ marginTop: 0 }}>⚠️ Обнаружены конфликты источников!</h3>
                    <p>Следующие шины имеют несколько активных источников и будут автоматически выключены:</p>
                    <ul>
                        {Array.from(conflictBuses.entries()).map(([busId, sources]) => (
                            <li key={busId}>
                                <strong>{busId}</strong>: получает питание от {Array.from(sources).join(', ')}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ position: 'relative' }}>
                <svg
                    width="100%"
                    height="60vh"
                    style={{
                        backgroundColor: '#2a2a2a',
                        borderRadius: '8px',
                        cursor: mode === 'add-connection' ? 'crosshair' : 'default'
                    }}
                    onClick={handleCanvasClick}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#3a3a3a" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {connections.map((conn) => {
                        const fromNode = nodes.find(n => n.id === conn.from);
                        const toNode = nodes.find(n => n.id === conn.to);
                        const color = getLineColor(conn.from, conn.to);
                        const isActive = isLineActive(conn.from, conn.to);

                        if (!fromNode || !toNode) return null;

                        return (
                            <g key={conn.id}>
                                <line
                                    x1={fromNode.x}
                                    y1={fromNode.y}
                                    x2={toNode.x}
                                    y2={toNode.y}
                                    stroke={color}
                                    strokeWidth="3"
                                />
                                {/* Эффект свечения для активных линий */}
                                {isActive && (
                                    <line
                                        x1={fromNode.x}
                                        y1={fromNode.y}
                                        x2={toNode.x}
                                        y2={toNode.y}
                                        stroke={color}
                                        strokeWidth="1"
                                        opacity="0.5"
                                        style={{ filter: 'blur(3px)' }}
                                    />
                                )}
                            </g>
                        );
                    })}

                    {drawingConnection && (
                        <>
                            <line
                                x1={nodes.find(n => n.id === drawingConnection.from)?.x}
                                y1={nodes.find(n => n.id === drawingConnection.from)?.y}
                                x2={drawingConnection.currentX}
                                y2={drawingConnection.currentY}
                                stroke="#ffff00"
                                strokeWidth="3"
                                strokeDasharray="5,5"
                            />
                            <circle
                                cx={drawingConnection.currentX}
                                cy={drawingConnection.currentY}
                                r="8"
                                fill="#ffff00"
                                opacity="0.5"
                            />
                        </>
                    )}

                    {nodes.map(node => {
                        const nodeColor = getNodeColor(node.id);
                        const isDragging = draggingNode === node.id;

                        return (
                            <g key={node.id}>
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
                                        stroke={isDragging ? "white" : "#333"}
                                        strokeWidth={isDragging ? "3" : "2"}
                                        cursor="move"
                                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                        onClick={() => toggleNode(node.id)}
                                    />
                                ) : (
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r="15"
                                        fill={nodeColor}
                                        stroke={isDragging ? "white" : "#333"}
                                        strokeWidth={isDragging ? "3" : "2"}
                                        cursor="move"
                                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                                        onClick={() => toggleNode(node.id)}
                                    />
                                )}

                                <text
                                    x={node.x}
                                    y={node.y + (node.type === 'power' ? 40 : 30)}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize="12"
                                    fontWeight="bold"
                                    style={{ textShadow: '0 0 3px black' }}
                                >
                                    {node.id}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px',
                    fontSize: '12px'
                }}>
                    {mode === 'add-connection' && 'Кликните на два узла для соединения'}
                    {mode === 'add-power' && 'Кликните на холст для добавления источника'}
                    {mode === 'add-bus' && 'Кликните на холст для добавления шины'}
                    {mode === 'select' && 'Кликните на элемент для переключения, перетащите для перемещения'}
                </div>
            </div>

            <div style={{
                marginTop: '20px',
                color: 'white',
                padding: '15px',
                backgroundColor: '#2a2a2a',
                borderRadius: '8px'
            }}>
                <h3>📖 Логика цветов линий:</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <h4>🎨 Цвета:</h4>
                        <p>• <strong>Выключенный источник</strong> → серый</p>
                        <p>• <strong>Включенный источник</strong> → его цвет</p>
                        <p>• <strong>Выключенная шина</strong> → красная</p>
                        <p>• <strong>Включенная шина</strong> → цвет активного источника</p>
                        <p>• <strong>Активная линия</strong> → цвет источника</p>
                        <p>• <strong>Неактивная линия</strong> → серая</p>
                    </div>
                    <div>
                        <h4>🔗 Логика линий:</h4>
                        <p>• <strong>Линия между двумя активными шинами одного источника</strong> → цвет источника</p>
                        <p>• <strong>Линия между активной и неактивной шиной</strong> → цвет активной шины</p>
                        <p>• <strong>Линия между двумя разными источниками</strong> → серая (конфликт)</p>
                        <p>• <strong>Линия между выключенными элементами</strong> → серая</p>
                        <p>• <strong>Конфликт источников</strong> → шина автоматически выключается</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;