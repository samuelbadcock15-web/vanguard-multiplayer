const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let bluePlayer = null;
let redPlayer = null;

io.on('connection', (socket) => {
    if (!bluePlayer) {
        bluePlayer = socket.id;
        socket.emit('roleAssign', { team: 'blue' });
    } else if (!redPlayer) {
        redPlayer = socket.id;
        socket.emit('roleAssign', { team: 'red' });
    } else {
        socket.emit('roleAssign', { team: 'spectator' });
    }

    socket.on('playerMove', (data) => {
        socket.broadcast.emit('enemyMove', data);
    });

    socket.on('playerFire', (data) => {
        socket.broadcast.emit('enemyFire', data);
    });

    socket.on('placeBlock', (data) => {
        socket.broadcast.emit('blockPlaced', data);
    });

    socket.on('spawnUnit', (data) => {
        io.emit('unitSpawned', data);
    });

    socket.on('disconnect', () => {
        if (socket.id === bluePlayer) bluePlayer = null;
        if (socket.id === redPlayer) redPlayer = null;
        io.emit('playerLeft', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Vanguard multiplayer server listening on port ${PORT}`);
});
