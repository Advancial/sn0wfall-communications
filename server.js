const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

const USERS_FILE = path.join(__dirname, "data", "users.json");

// Ensure data directory and users.json exist
if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"));
}
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// Helper to read/write JSON
function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Authentication API
app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const users = getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ error: "Username taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    saveUsers(users);

    res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ success: true, username: user.username });
});

// Active socket mapping for user calling
const connectedUsers = new Map(); // username -> socket.id

io.on("connection", (socket) => {
    let currentUser = null;

    socket.on("register-socket", (username) => {
        currentUser = username;
        connectedUsers.set(username, socket.id);
        socket.join("global-chat");
    });

    // Public Chat Messages (Not saved)
    socket.on("message", (msg) => {
        io.to("global-chat").emit("message", msg);
    });

    // WebRTC Signaling with Call Dialog Target
    socket.on("call-user", ({ targetUser }) => {
        const targetSocketId = connectedUsers.get(targetUser);
        if (targetSocketId) {
            io.to(targetSocketId).emit("incoming-call", { from: currentUser });
        }
    });

    socket.on("accept-call", ({ to }) => {
        const targetSocketId = connectedUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-accepted", { from: currentUser });
        }
    });

    socket.on("decline-call", ({ to }) => {
        const targetSocketId = connectedUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-declined", { from: currentUser });
        }
    });

    socket.on("offer", ({ to, offer }) => {
        const targetSocketId = connectedUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("offer", { from: currentUser, offer });
        }
    });

    socket.on("answer", ({ to, answer }) => {
        const targetSocketId = connectedUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("answer", { from: currentUser, answer });
        }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        const targetSocketId = connectedUsers.get(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("ice-candidate", { from: currentUser, candidate });
        }
    });

    socket.on("disconnect", () => {
        if (currentUser) {
            connectedUsers.delete(currentUser);
        }
    });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
