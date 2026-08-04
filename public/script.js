const socket = io();

// UI Elements
const authBox = document.getElementById("authBox");
const chatBox = document.getElementById("chatBox");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

const chat = document.getElementById("chat");
const messageInput = document.getElementById("messageInput");
const mediaInput = document.getElementById("mediaInput");
const sendBtn = document.getElementById("sendBtn");
const callBtn = document.getElementById("callBtn");

const callBanner = document.getElementById("callBanner");
const callerName = document.getElementById("callerName");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");

let currentUser = "";
let activeCallPartner = null;

// --- Authentication ---
loginBtn.onclick = async () => {
    const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername.value, password: authPassword.value })
    });
    const data = await res.json();
    if (data.success) {
        currentUser = data.username;
        authBox.style.display = "none";
        chatBox.style.display = "flex";
        socket.emit("register-socket", currentUser);
    } else {
        alert(data.error);
    }
};

registerBtn.onclick = async () => {
    const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername.value, password: authPassword.value })
    });
    const data = await res.json();
    if (data.success) {
        alert("Account created! Please log in.");
    } else {
        alert(data.error);
    }
};

// --- Chat & Media Sharing ---
function sendMessage() {
    if (messageInput.value.trim()) {
        socket.emit("message", { name: currentUser, type: "text", text: messageInput.value });
        messageInput.value = "";
    }

    if (mediaInput.files.length) {
        const file = mediaInput.files[0];
        const reader = new FileReader();
        const isVideo = file.type.startsWith("video/");

        reader.onload = () => {
            socket.emit("message", {
                name: currentUser,
                type: isVideo ? "video" : "image",
                media: reader.result
            });
        };
        reader.readAsDataURL(file);
        mediaInput.value = "";
    }
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

socket.on("message", (msg) => {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${msg.name === currentUser ? "mine" : "theirs"}`;

    if (msg.type === "image") {
        bubble.innerHTML = `<strong>${msg.name}</strong><br><img class="sentImage" src="${msg.media}">`;
    } else if (msg.type === "video") {
        bubble.innerHTML = `<strong>${msg.name}</strong><br><video class="sentVideo" src="${msg.media}" controls></video>`;
    } else {
        bubble.innerHTML = `<strong>${msg.name}</strong><br>${msg.text}`;
    }

    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
});

// --- WebRTC Core Logic ---
let localStream = null;
let peer = null;

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

async function createPeer(targetUser) {
    if (peer) return peer;

    peer = new RTCPeerConnection(rtcConfig);

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", { to: targetUser, candidate: event.candidate });
        }
    };

    peer.ontrack = (event) => {
        let audio = document.getElementById("remoteAudio");
        if (!audio) {
            audio = document.createElement("audio");
            audio.id = "remoteAudio";
            audio.autoplay = true;
            audio.playsInline = true; // Crucial for iOS
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch(err => console.log("Audio play gesture required:", err));
    };

    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
        }
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    } catch (err) {
        console.error("Mic access error:", err);
    }

    return peer;
}

function closePeer() {
    if (peer) {
        peer.close();
        peer = null;
    }
    activeCallPartner = null;
}

// Call Action Triggers
callBtn.onclick = () => {
    const target = prompt("Enter username to call:");
    if (!target) return;
    activeCallPartner = target;
    socket.emit("call-user", { targetUser: target });
};

socket.on("incoming-call", ({ from }) => {
    activeCallPartner = from;
    callerName.textContent = from;
    callBanner.style.display = "flex";
});

acceptCallBtn.onclick = async () => {
    callBanner.style.display = "none";
    socket.emit("accept-call", { to: activeCallPartner });
};

declineCallBtn.onclick = () => {
    callBanner.style.display = "none";
    socket.emit("decline-call", { to: activeCallPartner });
    activeCallPartner = null;
};

socket.on("call-accepted", async ({ from }) => {
    await createPeer(from);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { to: from, offer });
});

socket.on("offer", async ({ from, offer }) => {
    await createPeer(from);

    // Safeguard SDP state before setting Remote Description
    if (peer.signalingState !== "stable") {
        await Promise.all([
            peer.setLocalDescription({ type: "rollback" }),
            peer.setRemoteDescription(new RTCSessionDescription(offer))
        ]);
    } else {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
    }

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("answer", { to: from, answer });
});

socket.on("answer", async ({ answer }) => {
    // FIX: Only set remote description if we are expecting an answer
    if (peer && peer.signalingState === "have-local-offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on("ice-candidate", async ({ candidate }) => {
    if (peer && peer.remoteDescription) {
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("ICE candidate error:", err);
        }
    }
});

// --- Snowflake Effect ---
const snow = document.getElementById("snow");
const flakes = ["❄", "❅", "❆", "✦"];
for (let i = 0; i < 45; i++) {
    const flake = document.createElement("div");
    flake.className = "snowflake";
    flake.textContent = flakes[Math.floor(Math.random() * flakes.length)];
    flake.style.left = Math.random() * 100 + "%";
    flake.style.fontSize = (Math.random() * 18 + 10) + "px";
    flake.style.animationDuration = (Math.random() * 12 + 8) + "s";
    flake.style.animationDelay = (-Math.random() * 20) + "s";
    snow.appendChild(flake);
}
