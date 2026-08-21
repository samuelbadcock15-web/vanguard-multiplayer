const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

let players = {
    vanguard: null,
    architect: null
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Assign roles dynamically
    if (!players.vanguard) {
        players.vanguard = socket.id;
        socket.emit('assigned-role', 'vanguard');
        console.log(`Assigned Vanguard to ${socket.id}`);
    } else if (!players.architect) {
        players.architect = socket.id;
        socket.emit('assigned-role', 'architect');
        console.log(`Assigned Architect to ${socket.id}`);
    } else {
        socket.emit('assigned-role', 'spectator');
    }

    // Relay position / movement updates between players
    socket.on('player-update', (data) => {
        socket.broadcast.emit('remote-player-update', data);
    });

    socket.on('spawn-unit', (data) => {
        socket.broadcast.emit('remote-spawn-unit', data);
    });

    socket.on('place-block', (data) => {
        socket.broadcast.emit('remote-place-block', data);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (players.vanguard === socket.id) players.vanguard = null;
        if (players.architect === socket.id) players.architect = null;
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
