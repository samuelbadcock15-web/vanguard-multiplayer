const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

const MAX_HP = 300;
const DAMAGE_PER_SHOT = 10;
const EFFECTIVE_COMBAT_RANGE = 140;

// Initialize 6 fixed 2-player lobbies
const rooms = {};
for (let i = 1; i <= 6; i++) {
    const roomId = `room_${i}`;
    rooms[roomId] = {
        id: roomId,
        name: `Arena 0${i}`,
        players: {}, // socketId: { team: 'blue'|'red', ready: false, hp: 300, pos: {x,y,z}, isDead: false }
        status: 'open'
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

function resetRoomToOpen(room) {
    room.status = 'open';
    const remainingIds = Object.keys(room.players);
    remainingIds.forEach(pId => {
        const sock = io.sockets.sockets.get(pId);
        if (sock) {
            sock.leave(room.id);
            sock.roomID = null;
            sock.emit('left_room_success');
        }
    });
    room.players = {};
}

function removePlayerFromCurrentRoom(socket) {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.players[socket.id]) {
            delete room.players[socket.id];
            socket.leave(roomId);
            socket.roomID = null;

            if (room.status === 'in_game') {
                io.to(roomId).emit('playerLeft', { id: socket.id });
                resetRoomToOpen(room);
            }
            broadcastLobbyState();
            break;
        }
    }
}

io.on('connection', (socket) => {
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
            ready: false,
            hp: MAX_HP,
            pos: assignedTeam === 'blue' ? { x: 430, y: 0, z: 430 } : { x: -430, y: 0, z: -430 },
            isDead: false
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
            playerIds.forEach(id => {
                room.players[id].hp = MAX_HP;
                room.players[id].isDead = false;
                const team = room.players[id].team;
                room.players[id].pos = team === 'blue' ? { x: 430, y: 0, z: 430 } : { x: -430, y: 0, z: -430 };
            });

            broadcastLobbyState();

            const p1 = playerIds[0];
            const p2 = playerIds[1];

            io.to(p1).emit('start_match_countdown', { team: room.players[p1].team });
            io.to(p2).emit('start_match_countdown', { team: room.players[p2].team });
        }
    });

    // In-game Relay & Positional Tracking
    socket.on('playerMove', (data) => {
        if (!socket.roomID) return;
        const room = rooms[socket.roomID];
        if (room && room.players[socket.id]) {
            room.players[socket.id].pos = { x: data.x, y: data.y, z: data.z };
        }
        socket.to(socket.roomID).emit('enemyMove', data);
    });

    socket.on('playerFire', (data) => {
        if (socket.roomID) socket.to(socket.roomID).emit('enemyFire', data);
    });

    socket.on('placeBlock', (data) => {
        if (socket.roomID) socket.to(socket.roomID).emit('blockPlaced', data);
    });

    // Units
    socket.on('spawnUnit', (data) => {
        if (socket.roomID) {
            io.to(socket.roomID).emit('unitSpawned', {
                id: data.id || `u_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                type: data.type,
                team: data.team
            });
        }
    });

    socket.on('unitSync', (data) => {
        if (socket.roomID) socket.to(socket.roomID).emit('unitSync', data);
    });

    // Authoritative Combat: Target reports receiving a hit
    socket.on('hitRegistered', (data) => {
        if (!socket.roomID) return;
        const room = rooms[socket.roomID];
        if (!room || room.status !== 'in_game') return;

        const victim = room.players[socket.id];
        if (!victim || victim.isDead) return;

        // Find shooter
        const shooterId = Object.keys(room.players).find(id => id !== socket.id);
        const shooter = shooterId ? room.players[shooterId] : null;

        // Calculate distance between shooter and victim
        let dist = 0;
        if (shooter && shooter.pos && victim.pos) {
            const dx = shooter.pos.x - victim.pos.x;
            const dz = shooter.pos.z - victim.pos.z;
            dist = Math.sqrt(dx * dx + dz * dz);
        }

        // Out of effective combat range -> ricochet
        if (dist > EFFECTIVE_COMBAT_RANGE) {
            io.to(socket.roomID).emit('ricochetEvent', {
                targetTeam: victim.team,
                pos: data.hitPos || victim.pos,
                normal: data.hitNormal || { x: 0, y: 1, z: 0 }
            });
            return;
        }

        // Apply authoritative damage
        victim.hp = Math.max(0, victim.hp - DAMAGE_PER_SHOT);

        io.to(socket.roomID).emit('healthUpdate', {
            targetTeam: victim.team,
            newHP: victim.hp
        });

        if (victim.hp <= 0) {
            victim.isDead = true;
            io.to(socket.roomID).emit('shipRespawn', {
                targetTeam: victim.team,
                deathPos: victim.pos
            });

            // Authoritative respawn reset timer
            setTimeout(() => {
                if (room.players[socket.id]) {
                    victim.hp = MAX_HP;
                    victim.isDead = false;
                    victim.pos = victim.team === 'blue' ? { x: 430, y: 0, z: 430 } : { x: -430, y: 0, z: -430 };
                }
            }, 1200);
        }
    });

    socket.on('matchEnded', (data) => {
        if (!socket.roomID) return;
        const room = rooms[socket.roomID];
        if (room) {
            io.to(socket.roomID).emit('matchEnded', data);
            resetRoomToOpen(room);
            broadcastLobbyState();
        }
    });

    socket.on('disconnect', () => {
        removePlayerFromCurrentRoom(socket);
    });
});

server.listen(PORT, () => {
    console.log(`Global Vanguard matchmaking server listening on port ${PORT}`);
});
