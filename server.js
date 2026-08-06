const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // 10MB limit for media pasting
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Track online socket connections (username -> socket.id)
const connectedUsers = new Map();
// Track active group chats (groupID -> group details)
const groupChats = new Map();

io.on("connection", (socket) => {
    let currentUser = null;

    // Register User without login requirements
    socket.on("register-socket", (username) => {
        if (!username) return;
        
        currentUser = username.trim().slice(0, 25);
        const key = currentUser.toLowerCase();
        
        connectedUsers.set(key, socket.id);
        socket.join("global-chat");

        // Broadcast active connected user list
        io.emit("user-list", Array.from(connectedUsers.keys()));
    });

    // Global Chat Messaging
    socket.on("message", (data) => {
        io.to("global-chat").emit("message", {
            ...data,
            id: Date.now().toString(),
            sender: currentUser || "Anonymous"
        });
    });

    // Private Direct Messaging
    socket.on("private-message", ({ to, msg }) => {
        if (!to) return;
        const targetId = connectedUsers.get(to.trim().toLowerCase());
        if (targetId && currentUser) {
            io.to(targetId).emit("private-message", {
                from: currentUser,
                to: to,
                msg: msg
            });
        }
    });

    // Group Chat System (Up to 90 Users)
    socket.on("create-group", ({ groupName, members }) => {
        const groupId = "group_" + Date.now();
        const groupMemberList = new Set([currentUser, ...members.map(m => m.trim())]);
        
        // Limit total group size to 90 users
        const finalMembers = Array.from(groupMemberList).slice(0, 90);
        
        groupChats.set(groupId, { name: groupName, members: finalMembers });

        finalMembers.forEach(member => {
            const memberSocketId = connectedUsers.get(member.toLowerCase());
            if (memberSocketId) {
                const targetSocket = io.sockets.sockets.get(memberSocketId);
                if (targetSocket) targetSocket.join(groupId);
            }
        });

        io.to(groupId).emit("group-created", { groupId, groupName, members: finalMembers });
    });

    socket.on("group-message", ({ groupId, msg }) => {
        io.to(groupId).emit("group-message", {
            groupId,
            sender: currentUser,
            msg,
            id: Date.now().toString()
        });
    });

    // Message Reaction, Edit, and Delete Events
    socket.on("edit-message", (data) => {
        io.emit("message-edited", data);
    });

    socket.on("delete-message", (data) => {
        io.emit("message-deleted", data);
    });

    socket.on("react-message", (data) => {
        io.emit("message-reacted", data);
    });

    // --- WebRTC Signaling (Calls & Screen Share) ---
    socket.on("call-user", ({ targetUser, isScreenShare }) => {
        const targetSocketId = connectedUsers.get(targetUser.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("incoming-call", { from: currentUser, isScreenShare });
        }
    });

    socket.on("accept-call", ({ to }) => {
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-accepted", { from: currentUser });
        }
    });

    socket.on("decline-call", ({ to }) => {
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-declined", { from: currentUser });
        }
    });

    socket.on("offer", ({ to, offer }) => {
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("offer", { from: currentUser, offer });
        }
    });

    socket.on("answer", ({ to, answer }) => {
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("answer", { from: currentUser, answer });
        }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("ice-candidate", { from: currentUser, candidate });
        }
    });

    socket.on("hangup-call", ({ to }) => {
        const targetSocketId = connectedUsers.get(to.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-ended");
        }
    });

    // Disconnect Handler
    socket.on("disconnect", () => {
        if (currentUser) {
            connectedUsers.delete(currentUser.toLowerCase());
            io.emit("user-list", Array.from(connectedUsers.keys()));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Snowfall Secrecy 2.0 Server running on port ${PORT}`));
