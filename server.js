const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let players = {}; // id -> { role, x, z, yaw, hp, baseHP, gold, type }
let gameState = {
    blocks: [],
    bullets: [],
    runners: [],
    snails: [],
    playerBaseHP: 100,
    aiBaseHP: 100
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Assign roles: First player is Vanguard (Blue), second is Architect (Red)
    let role = Object.keys(players).length === 0 ? 'vanguard' : 'architect';
    players[socket.id] = {
        id: socket.id,
        role: role,
        x: role === 'vanguard' ? 460 : -490,
        z: role === 'vanguard' ? 460 : -490,
        yaw: role === 'vanguard' ? 0.785 : 0,
        hp: 100,
        gold: 100
    };

    socket.emit('assigned_role', role);

    socket.on('player_input', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].yaw = data.yaw;
            players[socket.id].hp = data.hp;
        }
    });

    socket.on('spawn_unit', (data) => {
        // Handle unit or block spawns sent from clients
        io.emit('server_action', data);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
    });
});

// Broadcast game loops to all clients at 30fps
setInterval(() => {
    io.emit('state_update', { players, gameState });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
