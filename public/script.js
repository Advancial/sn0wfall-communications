const socket = io();

// UI Elements
const authBox = document.getElementById("authBox");
const chatBox = document.getElementById("chatBox");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");

const chat = document.getElementById("chat");
const chatTitle = document.getElementById("chatTitle");
const messageInput = document.getElementById("messageInput");
const mediaInput = document.getElementById("mediaInput");
const sendBtn = document.getElementById("sendBtn");
const callBtn = document.getElementById("callBtn");
const dmBtn = document.getElementById("dmBtn");

const callBanner = document.getElementById("callBanner");
const callerName = document.getElementById("callerName");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");

let currentUser = "";
let activeDmRecipient = null; // null = Global Chat
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

// --- DM Switcher ---
dmBtn.onclick = () => {
    const target = prompt("Enter username for Private DM (Leave blank for Global Chat):");
    if (target === null) return;
    
    if (target.trim() === "") {
        activeDmRecipient = null;
        chatTitle.textContent = "❄️ Global Chat";
    } else {
        activeDmRecipient = target.trim();
        chatTitle.textContent = `🔒 DM with ${activeDmRecipient}`;
    }
    chat.innerHTML = ""; // Ephemeral clear on channel swap
};

// --- Message Sending ---
function sendMessage() {
    const text = messageInput.value.trim();
    const hasFile = mediaInput.files.length > 0;

    if (!text && !hasFile) return;

    if (hasFile) {
        const file = mediaInput.files[0];
        const reader = new FileReader();
        const isVideo = file.type.startsWith("video/");

        reader.onload = () => {
            dispatchMessage({
                type: isVideo ? "video" : "image",
                media: reader.result,
                text: text
            });
        };
        reader.readAsDataURL(file);
        mediaInput.value = "";
    } else {
        dispatchMessage({ type: "text", text: text });
    }

    messageInput.value = "";
}

function dispatchMessage(msgPayload) {
    if (activeDmRecipient) {
        socket.emit("private-message", { to: activeDmRecipient, msg: msgPayload });
        renderBubble({ name: currentUser, ...msgPayload }, true);
    } else {
        socket.emit("message", { name: currentUser, ...msgPayload });
    }
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// Receive Public Message
socket.on("message", (msg) => {
    if (!activeDmRecipient) {
        renderBubble(msg, msg.name === currentUser);
    }
});

// Receive Private Message
socket.on("private-message", ({ from, msg }) => {
    if (activeDmRecipient && activeDmRecipient.toLowerCase() === from.toLowerCase()) {
        renderBubble({ name: from, ...msg }, false);
    } else {
        alert(`🔒 Private DM received from ${from}! Click "DM" to view.`);
    }
});

function renderBubble(msg, isMine) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${isMine ? "mine" : "theirs"}`;

    let content = `<strong>${msg.name}</strong><br>`;
    if (msg.type === "image") {
        content += `<img class="sentImage" src="${msg.media}"><br>`;
    } else if (msg.type === "video") {
        content += `<video class="sentVideo" src="${msg.media}" controls></video><br>`;
    }
    if (msg.text) content += msg.text;

    bubble.innerHTML = content;
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
}

// Replace the WebRTC section in public/script.js with this:

let localStream = null;
let peer = null;
let pendingIceCandidates = [];

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

async function getMicrophoneStream() {
    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true }
        });
    }
    return localStream;
}

async function createPeer(targetUser) {
    if (peer) return peer;

    pendingIceCandidates = [];
    peer = new RTCPeerConnection(rtcConfig);

    peer.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", { to: targetUser, candidate: event.candidate });
        }
    };

    // ONLY attach REMOTE tracks to the remote audio element
    peer.ontrack = (event) => {
        let audio = document.getElementById("remoteAudio");
        if (!audio) {
            audio = document.createElement("audio");
            audio.id = "remoteAudio";
            audio.autoplay = true;
            audio.playsInline = true;
            document.body.appendChild(audio);
        }
        
        // Assign the remote stream (NOT localStream)
        if (event.streams && event.streams[0]) {
            audio.srcObject = event.streams[0];
        } else {
            audio.srcObject = new MediaStream([event.track]);
        }
        
        audio.play().catch(err => console.log("Audio playback blocked by browser:", err));
    };

    // Attach local mic tracks to send out (DO NOT attach to local <audio> tag)
    const stream = await getMicrophoneStream();
    stream.getAudioTracks().forEach(track => {
        peer.addTrack(track, stream);
    });

    return peer;
}

async function processPendingCandidates() {
    while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Queued candidate error:", err);
        }
    }
}

callBtn.onclick = async () => {
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
    if (peer) {
        peer.close();
        peer = null;
    }
};

socket.on("call-accepted", async ({ from }) => {
    await createPeer(from);
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    socket.emit("offer", { to: from, offer });
});

socket.on("offer", async ({ from, offer }) => {
    await createPeer(from);
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    await processPendingCandidates();

    const answer = await peer.createAnswer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(answer);
    socket.emit("answer", { to: from, answer });
});

socket.on("answer", async ({ answer }) => {
    if (peer && peer.signalingState === "have-local-offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
        await processPendingCandidates();
    }
});

socket.on("ice-candidate", async ({ candidate }) => {
    if (peer && peer.remoteDescription && peer.remoteDescription.type) {
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("ICE error:", err);
        }
    } else {
        pendingIceCandidates.push(candidate);
    }
});
// --- Snow Effect ---
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
