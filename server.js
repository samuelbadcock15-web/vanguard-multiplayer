const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

let players = {};
let bluePlayer = null;
let redPlayer = null;

io.on('connection', (socket) => {
    // Assign roles dynamically
    if (!bluePlayer) {
        bluePlayer = socket.id;
        players[socket.id] = { team: 'blue', hp: 100 };
        socket.emit('roleAssign', { team: 'blue' });
        console.log(`Blue Commander connected: ${socket.id}`);
    } else if (!redPlayer) {
        redPlayer = socket.id;
        players[socket.id] = { team: 'red', hp: 100 };
        socket.emit('roleAssign', { team: 'red' });
        console.log(`Red Commander connected: ${socket.id}`);
    } else {
        players[socket.id] = { team: 'spectator', hp: 100 };
        socket.emit('roleAssign', { team: 'spectator' });
        console.log(`Spectator connected: ${socket.id}`);
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

    // Handle incoming hits and broadcast damage to the opponent
    socket.on('shipHit', (data) => {
        socket.broadcast.emit('shipHit', data);
    });

    // Handle respawn coordination
    socket.on('playerRespawn', (data) => {
        socket.broadcast.emit('playerRespawn', data);
    });

    socket.on('disconnect', () => {
        if (socket.id === bluePlayer) {
            bluePlayer = null;
            console.log('Blue Commander disconnected.');
        } else if (socket.id === redPlayer) {
            redPlayer = null;
            console.log('Red Commander disconnected.');
        }
        delete players[socket.id];
        
        for (let id in players) {
            if (players[id].team === 'spectator') {
                if (!bluePlayer) {
                    bluePlayer = id;
                    players[id].team = 'blue';
                    io.to(id).emit('roleAssign', { team: 'blue' });
                    break;
                } else if (!redPlayer) {
                    redPlayer = id;
                    players[id].team = 'red';
                    io.to(id).emit('roleAssign', { team: 'red' });
                    break;
                }
            }
        }

        io.emit('playerLeft', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Vanguard multiplayer server listening on port ${PORT}`);
});
