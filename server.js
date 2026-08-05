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

if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"));
}
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Authentication Routes
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

// Connected Users Map (lowercased username -> socket.id)
const connectedUsers = new Map();

io.on("connection", (socket) => {
    let currentUser = null;

    // Register Socket Connection
    socket.on("register-socket", (username) => {
        if (!username) return;
        currentUser = username;
        const normalizedKey = username.trim().toLowerCase();
        
        connectedUsers.set(normalizedKey, socket.id);
        socket.join("global-chat");
        
        // Broadcast online user list
        io.emit("user-list", Array.from(connectedUsers.keys()));
    });

    // Global Chat Messages
    socket.on("message", (msg) => {
        io.to("global-chat").emit("message", {
            ...msg,
            name: currentUser || "Anonymous"
        });
    });

    // Private Direct Messaging
    socket.on("private-message", ({ to, msg }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId && currentUser) {
            io.to(targetSocketId).emit("private-message", {
                from: currentUser,
                to: to,
                msg: msg
            });
        }
    });

    // --- WebRTC Calling Signals ---

    socket.on("call-user", ({ targetUser }) => {
        if (!targetUser) return;
        const targetSocketId = connectedUsers.get(targetUser.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("incoming-call", { from: currentUser });
        } else {
            socket.emit("call-error", `User "${targetUser}" is not connected.`);
        }
    });

    socket.on("accept-call", ({ to }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-accepted", { from: currentUser });
        }
    });

    socket.on("decline-call", ({ to }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-declined", { from: currentUser });
        }
    });

    socket.on("offer", ({ to, offer }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("offer", { from: currentUser, offer });
        }
    });

    socket.on("answer", ({ to, answer }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("answer", { from: currentUser, answer });
        }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("ice-candidate", { from: currentUser, candidate });
        }
    });

    socket.on("hangup-call", ({ to }) => {
        if (!to) return;
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-ended");
        }
    });

    // Disconnect Handler
    socket.on("disconnect", () => {
        if (currentUser) {
            const normalizedKey = currentUser.trim().toLowerCase();
            connectedUsers.delete(normalizedKey);
            io.emit("user-list", Array.from(connectedUsers.keys()));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
