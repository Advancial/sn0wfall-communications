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
// Voice Calling (Updated)
// =======================

let localStream;
let peer;

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

async function createPeer() {
    if (peer) return; // Prevent recreating if already initialized

    peer = new RTCPeerConnection(rtcConfig);

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate);
        }
    };

    peer.ontrack = (event) => {
        let audio = document.getElementById("remoteAudio");
        if (!audio) {
            audio = document.createElement("audio");
            audio.id = "remoteAudio";
            audio.autoplay = true;
            audio.playsInline = true; // Crucial for iOS Safari
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
        
        // Force play for Safari policies
        audio.play().catch(err => console.log("Audio play blocked, waiting for user gesture:", err));
    };

    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true } 
            });
        }
        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
    } catch (err) {
        console.error("Microphone access denied or not supported:", err);
        alert("Could not access microphone. Please check permissions and ensure you are using HTTPS.");
    }
}

// Triggered when you initiate a call
call.onclick = async () => {
    await createPeer();
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("call-user");
    socket.emit("offer", offer);
};

// Handle incoming call signal
socket.on("incoming-call", () => {
    console.log("Incoming call...");
    // OPTIONAL: Display an "Answer Call" button on the UI here 
    // so the user can tap it to satisfy iOS gesture policies.
});

socket.on("offer", async (offer) => {
    await createPeer();
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("answer", answer);
});

socket.on("answer", async (answer) => {
    if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on("ice-candidate", async (candidate) => {
    if (peer) {
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Error adding received ice candidate", err);
        }
    }
});
