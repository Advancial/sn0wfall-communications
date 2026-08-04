const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let roomPassword = "thewarmthyoufeelinthecold";

io.on("connection", (socket) => {

    console.log("User connected");


    socket.on("join", (password)=>{

        if(password === roomPassword){

            socket.join("private-room");
            socket.emit("access", true);

        } else {

            socket.emit("access", false);

        }

    });


    socket.on("changePassword",(newPassword)=>{

        if(socket.rooms.has("private-room")){

            roomPassword = newPassword;

        }

    });



    socket.on("message",(msg)=>{

        if(socket.rooms.has("private-room")){

            io.to("private-room").emit(
                "message",
                msg
            );

        }

    });



   // =======================
    // Voice Calling Signaling
    // =======================
    
    socket.on("call-user", () => {
        // Broadcast incoming call to everyone else in the room
        socket.to("private-room").emit("incoming-call");
    });

    socket.on("offer", (offer) => {
        // Send the offer specifically to the other peer in the room
        socket.to("private-room").emit("offer", offer);
    });

    socket.on("answer", (answer) => {
        // Send the answer back to the offerer
        socket.to("private-room").emit("answer", answer);
    });

    socket.on("ice-candidate", (candidate) => {
        // Forward ICE candidates to the other peer
        socket.to("private-room").emit("ice-candidate", candidate);
    });


    socket.on("disconnect",()=>{

        console.log("User disconnected");

    });

});

const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {

    console.log(
        `❄️ Sn0wfall Secrecy running on port ${PORT}`
    );

});
