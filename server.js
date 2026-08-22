const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

// Keep track of rooms and waiting players
let waitingPlayer = null;
let rooms = {}; // roomId -> { blue: socketId, red: socketId, ready: {blue: false, red: false}, started: false }

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Matchmaking logic: Pair players into rooms of 2
    let assignedRoomId;
    let assignedTeam;

    if (!waitingPlayer) {
        // First player in queue waits as Blue
        waitingPlayer = socket;
        assignedRoomId = `room_${socket.id}`;
        assignedTeam = 'blue';
        
        rooms[assignedRoomId] = {
            blue: socket.id,
            red: null,
            ready: { blue: false, red: false },
            started: false
        };
        socket.roomID = assignedRoomId;
    } else {
        // Second player joins the waiting player as Red, starting a new match room!
        assignedRoomId = waitingPlayer.roomID;
        assignedTeam = 'red';
        
        rooms[assignedRoomId].red = socket.id;
        socket.roomID = assignedRoomId;

        // Clear the queue so the next player starts the next room
        waitingPlayer = null;
    }

    socket.join(assignedRoomId);
    socket.emit('roleAssign', { team: assignedTeam });
    
    // Send initial room ready status
    io.to(assignedRoomId).emit('updateReadyStatus', rooms[assignedRoomId].ready);

    socket.on('playerReady', () => {
        let room = rooms[socket.roomID];
        if (room) {
            if (socket.id === room.blue) room.ready.blue = true;
            if (socket.id === room.red) room.ready.red = true;

            io.to(socket.roomID).emit('updateReadyStatus', room.ready);

            if (room.ready.blue && room.ready.red && !room.started) {
                room.started = true;
                io.to(socket.roomID).emit('startCountdown');
            }
        }
    });

    socket.on('playerMove', (data) => {
        socket.to(socket.roomID).emit('enemyMove', data);
    });

    socket.on('playerFire', (data) => {
        socket.to(socket.roomID).emit('enemyFire', data);
    });

    socket.on('placeBlock', (data) => {
        socket.to(socket.roomID).emit('blockPlaced', data);
    });

    socket.on('spawnUnit', (data) => {
        io.to(socket.roomID).emit('unitSpawned', data);
    });

    socket.on('shipHit', (data) => {
        io.to(socket.roomID).emit('applyStun', { team: data.targetTeam });
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }

        let roomId = socket.roomID;
        if (roomId && rooms[roomId]) {
            io.to(roomId).emit('playerLeft', { id: socket.id });
            delete rooms[roomId];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Global Vanguard matchmaking server listening on port ${PORT}`);
});
