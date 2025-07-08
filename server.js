import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

// ✅ 1. Setup express
const app = express();

// ✅ 2. Setup allowed frontend origin
const allowedOrigin = "https://stranger-chat-frontend-theta.vercel.app";

// ✅ 3. Enable CORS for your frontend
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

// ✅ 4. Create HTTP server
const server = http.createServer(app);

// ✅ 5. Create socket.io server with proper CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    credentials: true
  }
});

// ✅ Now continue with the rest...
let waitingUsers = [];
let rooms = {};

function matchUsers(socket, interests) {
  let match = null;
  if (interests && interests.length > 0) {
    match = waitingUsers.find(
      u => u.socket.id !== socket.id && u.interests.some(i => interests.includes(i))
    );
  }
  if (!match) {
    match = waitingUsers.find(u => u.socket.id !== socket.id);
  }
  if (match) {
    // Create room
    const roomId = `room_${socket.id}_${match.socket.id}`;
    rooms[roomId] = [socket, match.socket];
    socket.join(roomId);
    match.socket.join(roomId);
    socket.emit("matched", { roomId, initiator: true });
    match.socket.emit("matched", { roomId, initiator: false });
    // Remove both from waiting
    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id && u.socket.id !== match.socket.id);
  } else {
    waitingUsers.push({ socket, interests });
  }
}

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("find_partner", (interests) => {
    matchUsers(socket, interests);
  });

  socket.on("signal", ({ roomId, data }) => {
    socket.to(roomId).emit("signal", data);
  });

  socket.on("send_message", ({ roomId, message }) => {
    socket.to(roomId).emit("receive_message", message);
  });

  socket.on("typing", ({ roomId, typing }) => {
    socket.to(roomId).emit("typing", typing);
  });

  socket.on("disconnect_room", ({ roomId }) => {
    socket.leave(roomId);
    socket.to(roomId).emit("stranger_disconnected");
    if (rooms[roomId]) delete rooms[roomId];
  });

  socket.on("next", (interests) => {
    // Leave current room if any
    for (const [roomId, users] of Object.entries(rooms)) {
      if (users.some(u => u.id === socket.id)) {
        socket.leave(roomId);
        socket.to(roomId).emit("stranger_disconnected");
        delete rooms[roomId];
        break;
      }
    }
    matchUsers(socket, interests);
  });

  socket.on("disconnect", () => {
    // Remove from waiting
    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id);
    // Remove from room
    for (const [roomId, users] of Object.entries(rooms)) {
      if (users.some(u => u.id === socket.id)) {
        socket.to(roomId).emit("stranger_disconnected");
        delete rooms[roomId];
        break;
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("HeartMatch backend is running!");
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
