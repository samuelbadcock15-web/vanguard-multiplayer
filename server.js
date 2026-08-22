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
let readyStatus = { blue: false, red: false };
let gameStarted = false;

io.on('connection', (socket) => {
    let assignedTeam = null;

    if (!bluePlayer) {
        bluePlayer = socket.id;
        assignedTeam = 'blue';
        socket.emit('roleAssign', { team: 'blue' });
        console.log(`Blue Commander connected: ${socket.id}`);
    } else if (!redPlayer) {
        redPlayer = socket.id;
        assignedTeam = 'red';
        socket.emit('roleAssign', { team: 'red' });
        console.log(`Red Commander connected: ${socket.id}`);
    } else {
        assignedTeam = 'spectator';
        socket.emit('roleAssign', { team: 'spectator' });
        console.log(`Spectator connected: ${socket.id}`);
    }

    socket.emit('updateReadyStatus', readyStatus);

    socket.on('playerReady', () => {
        if (assignedTeam === 'blue' || assignedTeam === 'red') {
            readyStatus[assignedTeam] = true;
            io.emit('updateReadyStatus', readyStatus);

            if (readyStatus.blue && readyStatus.red && !gameStarted) {
                gameStarted = true;
                io.emit('startCountdown');
            }
        }
    });

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

    // Pure Stun/Freeze broadcast—no health, no invisible respawns!
    socket.on('shipHit', (data) => {
        io.emit('applyStun', { team: data.targetTeam });
    });

    socket.on('disconnect', () => {
        if (socket.id === bluePlayer) {
            bluePlayer = null;
            readyStatus.blue = false;
        }
        if (socket.id === redPlayer) {
            redPlayer = null;
            readyStatus.red = false;
        }
        gameStarted = false;
        io.emit('updateReadyStatus', readyStatus);
        io.emit('playerLeft', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Vanguard multiplayer server listening on port ${PORT}`);
});
