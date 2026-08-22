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

// Authoritative game state tracking bases and vessels
let gameState = {
    blue: { hp: 100, baseHp: 100 },
    red: { hp: 100, baseHp: 100 }
};

io.on('connection', (socket) => {
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

    // Synchronize Base Damage when units breach a base
    socket.on('damageBase', (data) => {
        let targetTeam = data.team; // 'blue' or 'red' base
        if (gameState[targetTeam]) {
            gameState[targetTeam].baseHp = Math.max(0, gameState[targetTeam].baseHp - data.amount);
            io.emit('baseDamageUpdate', { team: targetTeam, baseHp: gameState[targetTeam].baseHp });
        }
    });

    // Authoritative Craft Hit & Tactical Respawn Sync
    socket.on('shipHit', (data) => {
        let targetTeam = data.targetTeam;
        if (gameState[targetTeam]) {
            gameState[targetTeam].hp = Math.max(0, Math.min(100, gameState[targetTeam].hp - data.damage));
            
            io.emit('shipHealthUpdate', { 
                team: targetTeam, 
                hp: gameState[targetTeam].hp 
            });

            if (gameState[targetTeam].hp <= 0) {
                gameState[targetTeam].hp = 100;
                let respawnPos = (targetTeam === 'blue') ? { x: 460, y: 0, z: 460, yaw: 0.785 } : { x: -460, y: 0, z: -460, yaw: -2.356 };
                
                io.emit('shipDestroyedAndRespawn', {
                    team: targetTeam,
                    ...respawnPos
                });
            }
        }
    });

    socket.on('syncHealth', (data) => {
        if (gameState[data.team]) {
            gameState[data.team].hp = Math.max(0, Math.min(100, data.hp));
            socket.broadcast.emit('shipHealthUpdate', { team: data.team, hp: gameState[data.team].hp });
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
