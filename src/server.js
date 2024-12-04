const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(cors());

// Хранилище данных игроков
const players = new Map(); // playerId -> { position, bonuses, activeBombs }
const obstacles = []; // Список препятствий
const rooms = {}; // roomId -> { players: Set(playerId), obstacles: [] }

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Инициализация нового игрока
    socket.on('joinRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: new Set(), obstacles: generateObstacles() };
        }

        rooms[roomId].players.add(socket.id);
        players.set(socket.id, {
            position: { x: 50, y: 50 },
            bonuses: { radius: 0, bombs: 0 },
            activeBombs: 0,
            roomId,
        });

        socket.join(roomId);
        console.log(`Player ${socket.id} joined room ${roomId}`);

        // Отправка данных о состоянии комнаты
        io.to(roomId).emit('updatePlayers', Array.from(rooms[roomId].players).map((id) => ({
            id,
            ...players.get(id),
        })));
        io.to(roomId).emit('updateObstacles', rooms[roomId].obstacles);
    });

    // Обработка перемещения игрока
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            players.set(socket.id, player);
            io.to(player.roomId).emit('updatePlayer', { id: socket.id, position: player.position });
        }
    });

    // Обработка установки бомбы
    socket.on('placeBomb', () => {
        const player = players.get(socket.id);
        if (player && player.activeBombs < player.bonuses.bombs + 1) {
            player.activeBombs++;
            players.set(socket.id, player);

            const roomId = player.roomId;
            setTimeout(() => {
                io.to(roomId).emit('explosion', { position: player.position });
                handleExplosion(player.position, roomId, socket.id);
                player.activeBombs--;
                players.set(socket.id, player);
            }, 3000);
        }
    });

    // Обработка отключения игрока
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            const roomId = player.roomId;
            rooms[roomId].players.delete(socket.id);

            if (rooms[roomId].players.size === 0) {
                delete rooms[roomId]; // Удаление комнаты, если в ней больше нет игроков
            } else {
                io.to(roomId).emit('updatePlayers', Array.from(rooms[roomId].players).map((id) => ({
                    id,
                    ...players.get(id),
                })));
            }
        }
        console.log(`Player disconnected: ${socket.id}`);
        players.delete(socket.id);
    });
});

// Обработка взрывов
function handleExplosion(position, roomId, playerId) {
    const room = rooms[roomId];
    if (!room) return;

    const affectedObstacles = room.obstacles.filter(
        (obstacle) => obstacle.x === position.x && obstacle.y === position.y
    );

    // Удаление препятствий
    room.obstacles = room.obstacles.filter(
        (obstacle) => !affectedObstacles.includes(obstacle)
    );

    // Генерация бонусов
    affectedObstacles.forEach((obstacle) => {
        if (Math.random() > 0.5) {
            const bonus = generateBonus(obstacle.x, obstacle.y);
            io.to(roomId).emit('bonusGenerated', bonus);
        }
    });

    // Проверяем, попал ли взрыв в других игроков
    room.players.forEach((id) => {
        if (id !== playerId) {
            const player = players.get(id);
            if (player && player.position.x === position.x && player.position.y === position.y) {
                io.to(roomId).emit('playerHit', { id });
            }
        }
    });

    // Обновление состояния препятствий
    io.to(roomId).emit('updateObstacles', room.obstacles);
}

// Генерация препятствий
function generateObstacles() {
    const obstacles = [];
    for (let i = 0; i < 10; i++) {
        obstacles.push({
            x: Math.floor(Math.random() * 16) * 50,
            y: Math.floor(Math.random() * 12) * 50,
            isDestructible: Math.random() > 0.5,
        });
    }
    return obstacles;
}

// Генерация бонусов
function generateBonus(x, y) {
    const types = ['radius', 'bomb'];
    const type = types[Math.floor(Math.random() * types.length)];
    return { x, y, type };
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});