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
const obstacles = []; // Список препятствий (можно расширить для генерации)

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Инициализация нового игрока
    players.set(socket.id, {
        position: { x: 50, y: 50 },
        bonuses: { radius: 0, bombs: 0 },
        activeBombs: 0,
    });

    // Отправка данных всем клиентам о новом игроке
    io.emit('updatePlayers', Array.from(players.entries()).map(([id, data]) => ({ id, ...data })));

    // Обработка перемещения игрока
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            players.set(socket.id, player);
            io.emit('updatePlayer', { id: socket.id, position: player.position });
        }
    });

    // Обработка установки бомбы
    socket.on('placeBomb', () => {
        const player = players.get(socket.id);
        if (player && player.activeBombs < player.bonuses.bombs + 1) {
            player.activeBombs++;
            players.set(socket.id, player);

            // Эмуляция взрыва через 3 секунды
            setTimeout(() => {
                io.emit('explosion', { position: player.position });
                handleExplosion(player.position, socket.id);
                player.activeBombs--;
                players.set(socket.id, player);
            }, 3000);
        }
    });

    // Обработка отключения игрока
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        players.delete(socket.id);
        io.emit('playerDisconnected', { id: socket.id });
    });
});

// Обработка взрывов
function handleExplosion(position, playerId) {
    // Удаляем препятствия на позиции взрыва
    const affectedObstacles = obstacles.filter(
        (obstacle) => obstacle.x === position.x && obstacle.y === position.y
    );

    // Если есть разрушимое препятствие, удаляем его
    obstacles.forEach((obstacle, index) => {
        if (affectedObstacles.includes(obstacle)) {
            obstacles.splice(index, 1);
        }
    });

    // Проверяем, попал ли взрыв в других игроков
    players.forEach((player, id) => {
        if (id !== playerId && player.position.x === position.x && player.position.y === position.y) {
            io.emit('playerHit', { id });
        }
    });

    // Обновляем состояние препятствий
    io.emit('updateObstacles', obstacles);
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
