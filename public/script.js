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
        // Send DM
        socket.emit("private-message", { to: activeDmRecipient, msg: msgPayload });
        renderBubble({ name: currentUser, ...msgPayload }, true);
    } else {
        // Send Public Message
        socket.emit("message", { name: currentUser, ...msgPayload });
    }
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// Replace your socket.on("message") and socket.on("private-message") in script.js with this:

// Receive Public Chat Message
socket.on("message", (msg) => {
    // IGNORE global messages if we are currently inside a private DM view
    if (!activeDmRecipient) {
        renderBubble(msg, msg.name === currentUser);
    }
});

// Receive Private Message
socket.on("private-message", ({ from, to, msg }) => {
    // Only render the bubble if we are currently looking at THIS specific DM
    if (activeDmRecipient && activeDmRecipient.toLowerCase() === from.toLowerCase()) {
        renderBubble({ name: from, ...msg }, false);
    } else {
        // Push notification alert if receiving a DM while in Global Chat or another DM
        alert(`🔒 Private DM received from ${from}! Click "DM" and type "${from}" to view.`);
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

// --- Reliable WebRTC Audio Engine ---
let localStream = null;
let peer = null;
let pendingIceCandidates = [];

// Working STUN servers (using Google's official STUN cluster)
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" }
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

    pendingIceCandidates = []; // Reset candidate queue
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
            audio.playsInline = true;
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch(err => console.log("Audio playback waiting on user interaction:", err));
    };

    // Attach local microphone tracks BEFORE creating offers/answers
    const stream = await getMicrophoneStream();
    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    return peer;
}

// Process buffered ICE candidates once remote description is ready
async function processPendingCandidates() {
    while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Error adding queued ICE candidate:", err);
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
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { to: from, offer });
});

socket.on("offer", async ({ from, offer }) => {
    await createPeer(from);

    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    await processPendingCandidates(); // Flush candidates arriving during offer set

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("answer", { to: from, answer });
});

socket.on("answer", async ({ answer }) => {
    if (peer && peer.signalingState === "have-local-offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
        await processPendingCandidates(); // Flush candidates arriving during answer set
    }
});

socket.on("ice-candidate", async ({ candidate }) => {
    if (peer && peer.remoteDescription && peer.remoteDescription.type) {
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("ICE Candidate Error:", err);
        }
    } else {
        // Queue candidates that arrive before Remote Description is set
        pendingIceCandidates.push(candidate);
    }
});

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
            audio.playsInline = true;
            document.body.appendChild(audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch(err => console.log("Audio permission delay:", err));
    };

    // Ensure local stream audio tracks are attached BEFORE offer/answer
    const stream = await getMicrophoneStream();
    stream.getTracks().forEach(track => peer.addTrack(track, stream));

    return peer;
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
};

socket.on("call-accepted", async ({ from }) => {
    await createPeer(from);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { to: from, offer });
});

socket.on("offer", async ({ from, offer }) => {
    await createPeer(from);

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
    if (peer && peer.signalingState === "have-local-offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on("ice-candidate", async ({ candidate }) => {
    if (peer && peer.remoteDescription) {
        try {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("ICE error:", err);
        }
    }
});

// Snow Animation
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
