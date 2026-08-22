const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.static(__dirname));

let players = {};
let blueSocketId = null;
let redSocketId = null;

// Clean server-side health tracking
let gameState = {
    blue: { hp: 100, baseHp: 100 },
    red: { hp: 100, baseHp: 100 }
};

io.on('connection', (socket) => {
    // Role assignment
    if (!blueSocketId) {
        blueSocketId = socket.id;
        players[socket.id] = { team: 'blue' };
        socket.emit('roleAssign', { team: 'blue' });
        console.log(`Blue Commander connected: ${socket.id}`);
    } else if (!redSocketId) {
        redSocketId = socket.id;
        players[socket.id] = { team: 'red' };
        socket.emit('roleAssign', { team: 'red' });
        console.log(`Red Commander connected: ${socket.id}`);
    } else {
        players[socket.id] = { team: 'spectator' };
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

    // Authoritative Hit Handling & Respawns
    socket.on('registerHit', (data) => {
        let victimTeam = data.targetTeam; // 'blue' or 'red'
        if (gameState[victimTeam]) {
            gameState[victimTeam].hp = Math.max(0, gameState[victimTeam].hp - data.damage);

            // Tell everyone the new health states
            io.emit('updateHealth', {
                blueHp: gameState.blue.hp,
                redHp: gameState.red.hp,
                blueBase: gameState.blue.baseHp,
                redBase: gameState.red.baseHp
            });

            // Check for Vessel Death & Respawn
            if (gameState[victimTeam].hp <= 0) {
                gameState[victimTeam].hp = 100;
                let respawnPos = (victimTeam === 'blue') ? { x: 460, y: 0, z: 460, yaw: 0.785 } : { x: -460, y: 0, z: -460, yaw: -2.356 };
                
                io.emit('forceRespawn', {
                    team: victimTeam,
                    ...respawnPos
                });
            }
        }
    });

    socket.on('disconnect', () => {
        if (socket.id === blueSocketId) blueSocketId = null;
        if (socket.id === redSocketId) redSocketId = null;
        delete players[socket.id];
        io.emit('playerLeft', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`Vanguard server running on port ${PORT}`);
});
