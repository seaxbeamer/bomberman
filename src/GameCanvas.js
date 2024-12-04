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
    const [otherPlayers, setOtherPlayers] = useState([]);


    const [otherPlayerPosition, setOtherPlayerPosition] = useState({ x: 0, y: 0 });

    const [socket, setSocket] = useState(null);
    const [roomId] = useState('room1');

    useEffect(() => {
        const newSocket = io('http://localhost:3000');
        setSocket(newSocket);
        newSocket.emit('joinGame', roomId); // Подключаемся к комнате

        // Обработка событий от сервера
        
        // Обновление состояния игроков
        newSocket.on('updatePlayers', (updatedPlayers) => {
            setPlayers(updatedPlayers.reduce((acc, id) => {
                if (!acc[id]) acc[id] = { x: 50, y: 50 }; // Задаем начальные координаты
                return acc;
            }, {}));
        });

        // Обработка перемещения других игроков
        newSocket.on('playerMoved', ({ id, position }) => {
            setPlayers((prevPlayers) => ({
                ...prevPlayers,
                [id]: position,
            }));
        });

        newSocket.on('explosion', (data) => {
            setFire((prev) => [...prev, data.position]);
            setTimeout(() => {
                setFire((prev) => prev.filter((f) => f.x !== data.position.x || f.y !== data.position.y));
            }, 1000);
        });

        newSocket.on('playerHit', (data) => {
            if (data.id === newSocket.id) {
                setIsGameOver(true);
            }
        });

        newSocket.on('updateObstacles', (updatedObstacles) => {
            setObstacles(updatedObstacles);
        });

        return () => newSocket.close();
    }, [roomId]);

    // Формы препятствий
    const obstacleShapes = {
        '+': [
            { x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
        ],
        '-': [
            { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
        ],
        'Г': [
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 },
        ],
    };

    // Генерация препятствий
    const generateObstacles = () => {
        const newObstacles = [];
        const numObstacles = 10; // Количество препятствий

        for (let i = 0; i < numObstacles; i++) {
            const shapeKeys = Object.keys(obstacleShapes);
            const randomShape = obstacleShapes[shapeKeys[Math.floor(Math.random() * shapeKeys.length)]];
            const randomX = Math.floor(Math.random() * (GAME_WIDTH / CELL_SIZE)) * CELL_SIZE;
            const randomY = Math.floor(Math.random() * (GAME_HEIGHT / CELL_SIZE)) * CELL_SIZE;

            randomShape.forEach((cell) => {
                const cellX = randomX + cell.x * CELL_SIZE;
                const cellY = randomY + cell.y * CELL_SIZE;

                if (
                    !(
                        (cellX === 0 && cellY === 0) ||
                        (cellX === GAME_WIDTH - CELL_SIZE && cellY === 0) ||
                        (cellX === 0 && cellY === GAME_HEIGHT - CELL_SIZE) ||
                        (cellX === GAME_WIDTH - CELL_SIZE && cellY === GAME_HEIGHT - CELL_SIZE)
                    )
                ) {
                    newObstacles.push({
                        x: cellX,
                        y: cellY,
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        isDestructible: Math.random() > 0.5 // С вероятностью 50%
                    });
                }
            });
        }
        setObstacles(newObstacles);
    };

    const handleFireCollision = (fireX, fireY) => {
        setObstacles((prevObstacles) =>
            prevObstacles.filter((obstacle) => {
                if (obstacle.x === fireX && obstacle.y === fireY && obstacle.isDestructible) {
                    generateBonus(fireX, fireY); // Генерация бонуса при разрушении стены
                    return false;
                }
                return true;
            })
        );
    };

    const generateBonus = (x, y) => {
        if (Math.random() > 0.25) return; // 25% шанс
        if (bonuses.some((bonus) => bonus.x === x && bonus.y === y)) return; // Ограничение на 1 бонус в позиции
        const bonusTypes = ["radius", "bomb"];
        const randomBonus = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
        const bonusId = `${x}-${y}-${Date.now()}`;
        setBonuses((prevBonuses) => [
            ...prevBonuses,
            { x, y, type: randomBonus, id: bonusId }
        ]);
        setTimeout(() => {
            setBonuses((prevBonuses) => prevBonuses.filter((bonus) => bonus.id !== bonusId));
        }, 5000);
    };
    

    const checkBonusPickup = (newX, newY) => {
        setBonuses((prevBonuses) =>
            prevBonuses.filter((bonus) => {
                if (bonus.x === newX && bonus.y === newY) {
                    setCollectedBonuses((prev) => ({
                        ...prev,
                        [bonus.type]: (prev[bonus.type] || 0) + 1,
                    }));
                    if (bonus.type === "radius") {
                        increaseExplosionRadius();
                    } else if (bonus.type === "bomb") {
                        increaseBombCount();
                    }
                    return false;
                }
                return true;
            })
        );
    };
    

    const increaseExplosionRadius = () => {
        setExplosionRadius((prevRadius) => prevRadius + 1); // Увеличиваем радиус на 1
    };

    const increaseBombCount = () => {
        setMaxBombs((prevMax) => prevMax + 1); // Увеличиваем максимальное количество бомб
    };

    const checkCollision = (x, y) => {
        return obstacles.some(
            (obstacle) => obstacle.x === x && obstacle.y === y
        );
    };
    
    const generateFire = (x, y) => {
        const firePositions = [];
        const directions = [
            { dx: 0, dy: -1 }, // Вверх
            { dx: 0, dy: 1 },  // Вниз
            { dx: -1, dy: 0 }, // Влево
            { dx: 1, dy: 0 },  // Вправо
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

    const handleKeyDown = (e) => {
        if (isGameOver) return;

        let { x, y } = position;
        let newX = x;
        let newY = y;

        if (e.key === ' ' && activeBombs < maxBombs) {
            const itemId = `${x}-${y}-${Date.now()}`;
            setItems((prevItems) => [
                ...prevItems,
                { x, y, id: itemId },
            ]);
            setActiveBombs((prevCount) => prevCount + 1);

            setTimeout(() => {
                setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
                generateFire(x, y);
                setActiveBombs((prevCount) => prevCount - 1);
            }, 3000);

            return;
        }

        if (e.key === 'ArrowUp') newY -= CELL_SIZE;
        if (e.key === 'ArrowDown') newY += CELL_SIZE;
        if (e.key === 'ArrowLeft') newX -= CELL_SIZE;
        if (e.key === 'ArrowRight') newX += CELL_SIZE;

        if (
            newX >= 0 &&
            newY >= 0 &&
            newX < GAME_WIDTH &&
            newY < GAME_HEIGHT &&
            !checkCollision(newX, newY)
        ) {
            setPosition({ x: newX, y: newY });
            checkBonusPickup(newX, newY);
            if (socket) socket.emit('playerMove', { position: { x: newX, y: newY } });
        }

        if (e.key === ' ' && socket) {
            socket.emit('placeBomb');
        }
    };

    const checkGameOver = () => {
        const isInFire = fire.some(
            (f) => position.x === f.x && position.y === f.y
        );
        if (isInFire) {
            setIsGameOver(true);
            setBonuses([]); // Удаление всех бонусов с карты
        }
    };

    const restartGame = () => {
        setPosition({ x: 50, y: 50 });
        setFire([]);
        setObstacles([]);
        setBonuses([]);
        setActiveBombs(0);
        setExplosionRadius(3);
        setMaxBombs(1);
        setCollectedBonuses(0);
        setIsGameOver(false);
        generateObstacles();
        setCollectedBonuses({ radius: 0, bomb: 0 });
    };

    useEffect(() => {
        generateObstacles();
    }, []);

    useEffect(() => {
        const keyListener = (e) => handleKeyDown(e);
        window.addEventListener('keydown', keyListener);
        return () => window.removeEventListener('keydown', keyListener);
    }, [position, isGameOver, obstacles]);

    useEffect(() => {
        checkGameOver();
    }, [position, fire]);

    return (
        <>
            <div
                style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '5px',
                    fontSize: '16px',
                    zIndex: 10, // Поверх других элементов
                }}
            >
                <div>Радиус бонусов: {collectedBonuses.radius}</div>
                <div>Бомб бонусов: {collectedBonuses.bomb}</div>
            </div>

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
                            width={obstacle.width}
                            height={obstacle.height}
                            fill={obstacle.isDestructible ? "orange" : "red"}
                        />
                    ))}

                    {items.map((item) => (
                        <Circle
                            key={item.id}
                            x={item.x + CELL_SIZE / 2}
                            y={item.y + CELL_SIZE / 2}
                            radius={10}
                            fill="green"
                        />
                    ))}

                    {fire.map((f) => (
                        <Rect
                            key={f.id}
                            x={f.x}
                            y={f.y}
                            width={CELL_SIZE}
                            height={CELL_SIZE}
                            fill="orange"
                        />
                    ))}

                    {bonuses.map((bonus) => (
                        <Rect
                            key={bonus.id}
                            x={bonus.x + CELL_SIZE / 4}
                            y={bonus.y + CELL_SIZE / 4}
                            width={CELL_SIZE / 2}
                            height={CELL_SIZE / 2}
                            fill={bonus.type === "radius" ? "yellow" : "purple"}
                        />
                    ))}

                    <Circle
                        x={position.x + CELL_SIZE / 2}
                        y={position.y + CELL_SIZE / 2}
                        radius={20}
                        fill="blue"
                    />

                    {/* Отображение других игроков */}
                    {otherPlayers.map((player) => (
                        <Circle
                            key={player.id}
                            x={player.position.x + CELL_SIZE / 2}
                            y={player.position.y + CELL_SIZE / 2}
                            radius={20}
                            fill="red"
                        />
                    ))}
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
                    <button
                        style={{
                            padding: '10px 20px',
                            fontSize: '16px',
                            cursor: 'pointer',
                            backgroundColor: '#4caf50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                        }}
                        onClick={restartGame}
                    >
                        Restart Game
                    </button>
                </div>
            )}
        </>
    );
};

export default GameCanvas;