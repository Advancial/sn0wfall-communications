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



    // Voice calling

    socket.on("call-user",()=>{

        socket.to("private-room")
        .emit("incoming-call");

    });


    socket.on("offer",(data)=>{

        socket.to("private-room")
        .emit("offer",data);

    });


    socket.on("answer",(data)=>{

        socket.to("private-room")
        .emit("answer",data);

    });


    socket.on("ice-candidate",(data)=>{

        socket.to("private-room")
        .emit("ice-candidate",data);

    });



    socket.on("disconnect",()=>{

        console.log("User disconnected");

    });

});


server.listen(3003,()=>{

    console.log(
        "❄️ Sn0wfall Secrecy running Now"
    );

});
const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {
    console.log(`❄️ Sn0wfall Secrecy running on port ${PORT}`);
});
