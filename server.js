const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let players = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Assign roles: First player is Blue (Vanguard), second is Red (Architect)
    let role = Object.keys(players).length === 0 ? 'blue' : 'red';
    players[socket.id] = { role: role };

    socket.emit('assigned_role', role);

    // Listen for player movement & actions
    socket.emit('current_players', players);

    socket.on('player_update', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotation = data.rotation;
            socket.broadcast.emit('update_player', { id: socket.id, ...data });
        }
    });

    socket.on('spawn_unit', (data) => {
        io.emit('unit_spawned', data);
    });

    socket.on('place_block', (data) => {
        socket.broadcast.emit('block_placed', data);
    });

    socket.on('fire_bullet', (data) => {
        socket.broadcast.emit('bullet_fired', data);
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('player_disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
