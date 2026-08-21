const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let players = {}; // socket.id -> { team: 'blue' | 'red' }
let bluePlayer = null;
let redPlayer = null;

io.on('connection', (socket) => {
    // Role Assignment: 1st connection = Blue, 2nd connection = Red
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

    // Vehicle Movement Relay
    socket.on('playerMove', (data) => {
        socket.broadcast.emit('enemyMove', data);
    });

    // Shooting Relay
    socket.on('playerFire', (data) => {
        socket.broadcast.emit('enemyFire', data);
    });

    // Block Placement Relay
    socket.on('placeBlock', (data) => {
        socket.broadcast.emit('blockPlaced', data);
    });

    // Unit Spawning Relay
    socket.on('spawnUnit', (data) => {
        io.emit('unitSpawned', data);
    });

    // Disconnection Handling
    socket.on('disconnect', () => {
        if (socket.id === bluePlayer) bluePlayer = null;
        if (socket.id === redPlayer) redPlayer = null;
        delete players[socket.id];
        io.emit('playerLeft', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Vanguard server listening on port ${PORT}`);
});
