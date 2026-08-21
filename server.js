const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Serves index.html directly from the root directory
app.use(express.static(__dirname));

let players = {};
let bluePlayer = null;
let redPlayer = null;

io.on('connection', (socket) => {
    // 1st player is Blue, 2nd player is Red, others spectate
    if (!bluePlayer) {
        bluePlayer = socket.id;
        players[socket.id] = { team: 'blue' };
        socket.emit('roleAssign', { team: 'blue' });
    } else if (!redPlayer) {
        redPlayer = socket.id;
        players[socket.id] = { team: 'red' };
        socket.emit('roleAssign', { team: 'red' });
    } else {
        players[socket.id] = { team: 'spectator' };
        socket.emit('roleAssign', { team: 'spectator' });
    }

    // Relay tank position and rotation
    socket.on('playerMove', (data) => {
        socket.broadcast.emit('enemyMove', data);
    });

    // Relay weapon fire
    socket.on('playerFire', (data) => {
        socket.broadcast.emit('enemyFire', data);
    });

    // Relay placed cubes
    socket.on('placeBlock', (data) => {
        socket.broadcast.emit('blockPlaced', data);
    });

    // Relay unit spawns
    socket.on('spawnUnit', (data) => {
        io.emit('unitSpawned', data);
    });

    // Handle disconnections and free up player slots
    socket.on('disconnect', () => {
        if (socket.id === bluePlayer) bluePlayer = null;
        if (socket.id === redPlayer) redPlayer = null;
        delete players[socket.id];
        io.emit('playerLeft', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Vanguard multiplayer server listening on port ${PORT}`);
});
