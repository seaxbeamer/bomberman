import React, { useState, useEffect } from 'react';
import { Stage, Layer, Rect, Circle } from 'react-konva';
import { io } from 'socket.io-client';

const GameCanvas = () => {
    // Размеры игрового поля
    const GAME_WIDTH = 800;
    const GAME_HEIGHT = 600;
    const CELL_SIZE = 50; // Размер ячейки

    // Начальное положение персонажа
    const [position, setPosition] = useState({ x: 50, y: 50 });

    // Препятствия (статичное состояние после генерации)
    const [obstacles, setObstacles] = useState([]);

    // Игроки в комнате
    const [players, setPlayers] = useState({}); // Игроки в комнате

    // Состояние для предметов
    const [items, setItems] = useState([]);

    // Состояние для бонусов
    const [bonuses, setBonuses] = useState([]);

    // Состояние для собранных бонусов
    const [collectedBonuses, setCollectedBonuses] = useState({ radius: 0, bomb: 0 });

    // Состояние для огня
    const [fire, setFire] = useState([]);

    // Состояние для окончания игры
    const [isGameOver, setIsGameOver] = useState(false);

    // Радиус взрыва и максимальное количество бомб
    const [explosionRadius, setExplosionRadius] = useState(3); // Базовый радиус
    const [maxBombs, setMaxBombs] = useState(1); // Базовое количество бомб
    const [activeBombs, setActiveBombs] = useState(0); // Активные бомбы

    // Подключение к серверу
    const [socket, setSocket] = useState(null);

    // Состояние для комнаты и подключения
    const [roomId, setRoomId] = useState('');
    const [joined, setJoined] = useState(false); // Отслеживает подключение к комнате

    const rooms = {}; // roomId -> { players: Set(socket.id), obstacles: [] }

    io.on('connection', (socket) => {
        console.log(`Player connected: ${socket.id}`);
    
        socket.on('joinRoom', (roomId) => {
            if (!rooms[roomId]) {
                rooms[roomId] = { players: new Set(), obstacles: [] };
            }
    
            rooms[roomId].players.add(socket.id);
            socket.join(roomId);
    
            console.log(`Player ${socket.id} joined room ${roomId}`);
    
            // Отправляем всем игрокам в комнате информацию об игроках
            io.to(roomId).emit('updatePlayers', Array.from(rooms[roomId].players));
        });
    
        socket.on('playerMove', (data) => {
            const roomId = data.roomId;
            if (rooms[roomId]) {
                socket.to(roomId).emit('playerMoved', { id: socket.id, position: data.position });
            }
        });
    
        socket.on('disconnect', () => {
            for (const roomId in rooms) {
                if (rooms[roomId].players.has(socket.id)) {
                    rooms[roomId].players.delete(socket.id);
                    if (rooms[roomId].players.size === 0) {
                        delete rooms[roomId];
                    } else {
                        io.to(roomId).emit('updatePlayers', Array.from(rooms[roomId].players));
                    }
                    break;
                }
            }
            console.log(`Player disconnected: ${socket.id}`);
        });
    });
    
    server.listen(3000, () => {
        console.log('Server is running on port 3000');
    });

    useEffect(() => {
        const newSocket = io('http://localhost:3000');
        setSocket(newSocket);

        newSocket.on('updatePlayers', (updatedPlayers) => {
            setPlayers(updatedPlayers.reduce((acc, player) => {
                acc[player.id] = player.position;
                return acc;
            }, {}));
        });

        newSocket.on('updateObstacles', (updatedObstacles) => {
            setObstacles(updatedObstacles);
        });

        return () => newSocket.close();
    }, []);

    const handleJoinRoom = () => {
        if (socket && roomId.trim()) {
            socket.emit('joinRoom', roomId.trim());
            setJoined(true);
        }
    };
    
    useEffect(() => {
        socket.on('playerMoved', ({ id, position }) => {
            setPlayers((prev) => ({
                ...prev,
                [id]: position,
            }));
        });
    
        return () => socket.off('playerMoved');
    }, [socket]);

    const generateObstacles = () => {
        const newObstacles = [];
        const numObstacles = 10;

        for (let i = 0; i < numObstacles; i++) {
            const randomX = Math.floor(Math.random() * (GAME_WIDTH / CELL_SIZE)) * CELL_SIZE;
            const randomY = Math.floor(Math.random() * (GAME_HEIGHT / CELL_SIZE)) * CELL_SIZE;

            newObstacles.push({
                x: randomX,
                y: randomY,
                width: CELL_SIZE,
                height: CELL_SIZE,
                isDestructible: Math.random() > 0.5,
            });
        }
        setObstacles(newObstacles);
    };

    const handleKeyDown = (e) => {
        if (!joined || isGameOver) return;

        let { x, y } = position;
        let newX = x;
        let newY = y;

        if (e.key === 'ArrowUp') newY -= CELL_SIZE;
        if (e.key === 'ArrowDown') newY += CELL_SIZE;
        if (e.key === 'ArrowLeft') newX -= CELL_SIZE;
        if (e.key === 'ArrowRight') newX += CELL_SIZE;

        if (
            newX >= 0 &&
            newY >= 0 &&
            newX < GAME_WIDTH &&
            newY < GAME_HEIGHT &&
            !obstacles.some((obstacle) => obstacle.x === newX && obstacle.y === newY)
        ) {
            setPosition({ x: newX, y: newY });
            if (socket) socket.emit('playerMove', { position: { x: newX, y: newY }, roomId });
        }

        if (e.key === ' ' && activeBombs < maxBombs) {
            const itemId = `${x}-${y}-${Date.now()}`;
            setItems((prevItems) => [...prevItems, { x, y, id: itemId }]);
            setActiveBombs((prevCount) => prevCount + 1);

            setTimeout(() => {
                setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
                generateFire(x, y);
                setActiveBombs((prevCount) => prevCount - 1);
            }, 3000);

            return;
        }
    };

    const generateFire = (x, y) => {
        const firePositions = [];
        const directions = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 },
        ];

        directions.forEach(({ dx, dy }) => {
            for (let step = 1; step <= explosionRadius; step++) {
                const fireX = x + dx * CELL_SIZE * step;
                const fireY = y + dy * CELL_SIZE * step;

                const hitObstacle = obstacles.find(
                    (obstacle) => obstacle.x === fireX && obstacle.y === fireY
                );

                if (
                    fireX >= 0 &&
                    fireY >= 0 &&
                    fireX < GAME_WIDTH &&
                    fireY < GAME_HEIGHT
                ) {
                    if (hitObstacle) {
                        if (hitObstacle.isDestructible) {
                            handleFireCollision(fireX, fireY);
                            firePositions.push({ x: fireX, y: fireY, id: `${fireX}-${fireY}-${Date.now()}` });
                            continue;
                        } else {
                            break;
                        }
                    }
                    firePositions.push({ x: fireX, y: fireY, id: `${fireX}-${fireY}-${Date.now()}` });
                } else {
                    break;
                }
            }
        });

        firePositions.push({ x, y, id: `${x}-${y}-${Date.now()}` });

        setFire((prevFire) => [...prevFire, ...firePositions]);

        setTimeout(() => {
            setFire((prevFire) => prevFire.filter((f) => !firePositions.some((fp) => fp.id === f.id)));
        }, 1000);
    };

    const handleFireCollision = (fireX, fireY) => {
        setObstacles((prevObstacles) =>
            prevObstacles.filter((obstacle) => !(obstacle.x === fireX && obstacle.y === fireY))
        );
    };

    useEffect(() => {
        const keyListener = (e) => handleKeyDown(e);
        window.addEventListener('keydown', keyListener);
        return () => window.removeEventListener('keydown', keyListener);
    }, [position, obstacles, joined, isGameOver]);

    return (
        <div style={{ textAlign: 'center' }}>
            {!joined ? (
                <div>
                    <h2>Enter Room ID to Join</h2>
                    <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        placeholder="Room ID"
                        style={{
                            padding: '10px',
                            fontSize: '16px',
                            margin: '10px',
                            borderRadius: '5px',
                            border: '1px solid #ccc',
                        }}
                    />
                    <button
                        onClick={handleJoinRoom}
                        style={{
                            padding: '10px 20px',
                            fontSize: '16px',
                            cursor: 'pointer',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                        }}
                    >
                        Join Room
                    </button>
                </div>
            ) : (
                <>
                    <Stage
                        width={GAME_WIDTH}
                        height={GAME_HEIGHT}
                        style={{
                            border: '2px solid black',
                            margin: '20px auto',
                            display: 'block',
                        }}
                    >
                        <Layer>
                            <Rect x={0} y={0} width={GAME_WIDTH} height={GAME_HEIGHT} fill="#cce7ff" />

                            {obstacles.map((obstacle, index) => (
                                <Rect
                                    key={index}
                                    x={obstacle.x}
                                    y={obstacle.y}
                                    width={CELL_SIZE}
                                    height={CELL_SIZE}
                                    fill={obstacle.isDestructible ? 'orange' : 'red'}
                                />
                            ))}

                            <Circle
                                x={position.x + CELL_SIZE / 2}
                                y={position.y + CELL_SIZE / 2}
                                radius={20}
                                fill="blue"
                            />

                            {Object.keys(players).map((id) => {
                                if (id === socket.id) return null;
                                const playerPosition = players[id];
                                return (
                                    <Circle
                                        key={id}
                                        x={playerPosition.x + CELL_SIZE / 2}
                                        y={playerPosition.y + CELL_SIZE / 2}
                                        radius={20}
                                        fill="red"
                                    />
                                );
                            })}
                        </Layer>
                    </Stage>

                    {isGameOver && (
                        <div
                            style={{
                                textAlign: 'center',
                                marginTop: '20px',
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <h2 style={{ color: 'red' }}>Game Over</h2>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default GameCanvas;
