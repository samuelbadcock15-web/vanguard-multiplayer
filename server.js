const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// Initialize 6 fixed 2-player lobbies
const rooms = {};
for (let i = 1; i <= 6; i++) {
    const roomId = `room_${i}`;
    rooms[roomId] = {
        id: roomId,
        name: `Arena 0${i}`,
        players: {}, // socketId: { team: 'blue'|'red', ready: false }
        status: 'open' // 'open' | 'in_game'
    };
}

function getLobbiesSummary() {
    const list = [];
    for (const rId in rooms) {
        const r = rooms[rId];
        const pKeys = Object.keys(r.players);
        list.push({
            id: r.id,
            name: r.name,
            playerCount: pKeys.length,
            status: r.status,
            players: pKeys.map(id => ({
                id,
                ready: r.players[id].ready,
                team: r.players[id].team
            }))
        });
    }
    return list;
}

function broadcastLobbyState() {
    io.emit('lobbies_update', getLobbiesSummary());
}

function removePlayerFromCurrentRoom(socket) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.players[socket.id]) {
            delete room.players[socket.id];
            socket.leave(roomId);

            if (room.status === 'in_game') {
                io.to(roomId).emit('playerLeft', { id: socket.id });
                room.status = 'open';
                room.players = {};
            }
            broadcastLobbyState();
            break;
        }
    }
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Send initial list of all rooms
    socket.emit('lobbies_update', getLobbiesSummary());

    socket.on('join_room', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        if (room.status === 'in_game') {
            socket.emit('lobby_error', 'This match is currently in progress!');
            return;
        }

        const currentPlayers = Object.keys(room.players);
        if (currentPlayers.length >= 2) {
            socket.emit('lobby_error', 'This arena is full!');
            return;
        }

        removePlayerFromCurrentRoom(socket);

        let assignedTeam = 'blue';
        if (currentPlayers.length === 1) {
            const existingP = room.players[currentPlayers[0]];
            assignedTeam = existingP.team === 'blue' ? 'red' : 'blue';
        }

        room.players[socket.id] = {
            team: assignedTeam,
            ready: false
        };

        socket.roomID = roomId;
        socket.join(roomId);

        socket.emit('room_joined', {
            roomId: room.id,
            name: room.name,
            team: assignedTeam
        });

        broadcastLobbyState();
    });

    socket.on('leave_room', () => {
        removePlayerFromCurrentRoom(socket);
        socket.roomID = null;
        socket.emit('left_room_success');
        broadcastLobbyState();
    });

    socket.on('toggle_ready', (roomId) => {
        const room = rooms[roomId];
        if (!room || !room.players[socket.id]) return;

        room.players[socket.id].ready = !room.players[socket.id].ready;
        broadcastLobbyState();

        const playerIds = Object.keys(room.players);
        const allReady = playerIds.length === 2 && playerIds.every(id => room.players[id].ready);

        if (allReady) {
            room.status = 'in_game';
            broadcastLobbyState();

            const p1 = playerIds[0];
            const p2 = playerIds[1];

            io.to(p1).emit('start_match_countdown', { team: room.players[p1].team });
            io.to(p2).emit('start_match_countdown', { team: room.players[p2].team });
        }
    });

    // In-game Relay Events
    socket.on('playerMove', (data) => {
        if (socket.roomID) socket.to(socket.roomID).emit('enemyMove', data);
    });

    socket.on('playerFire', (data) => {
        if (socket.roomID) socket.to(socket.roomID).emit('enemyFire', data);
    });

    socket.on('placeBlock', (data) => {
        if (socket.roomID) socket.to(socket.roomID).emit('blockPlaced', data);
    });

    socket.on('spawnUnit', (data) => {
        if (socket.roomID) io.to(socket.roomID).emit('unitSpawned', data);
    });

    socket.on('shipHit', (data) => {
        if (socket.roomID) io.to(socket.roomID).emit('applyStun', { team: data.targetTeam });
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        removePlayerFromCurrentRoom(socket);
    });
});

server.listen(PORT, () => {
    console.log(`Global Vanguard matchmaking server listening on port ${PORT}`);
});
