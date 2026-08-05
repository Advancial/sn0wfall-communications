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

// Authentication
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

// Connected Users Map (username -> socket.id)
const connectedUsers = new Map();

// Replace the io.on("connection", ...) block in server.js with this:

io.on("connection", (socket) => {
    let currentUser = null;
// Add this inside io.on("connection", (socket) => { ... }) in server.js

socket.on("hangup-call", ({ to }) => {
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
        io.to(targetSocketId).emit("call-ended");
    }
});
    socket.on("register-socket", (username) => {
        if (!username) return;
        currentUser = username;
        connectedUsers.set(username, socket.id);
        socket.join("global-chat");
        io.emit("user-list", Array.from(connectedUsers.keys()));
    });

    // Public Chat (Global ONLY)
    socket.on("message", (msg) => {
        // Force the server to attach the verified username
        io.to("global-chat").emit("message", {
            ...msg,
            name: currentUser || "Anonymous"
        });
    });

    // Private Direct Message (DM ONLY - Never sent to global room)
    socket.on("private-message", ({ to, msg }) => {
        const targetSocketId = connectedUsers.get(to);
        if (targetSocketId && currentUser) {
            const payload = {
                from: currentUser,
                to: to,
                msg: msg
            };
            // Send ONLY to the recipient
            io.to(targetSocketId).emit("private-message", payload);
        }
    });

    // WebRTC Calling Signals
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
            io.emit("user-list", Array.from(connectedUsers.keys()));
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
