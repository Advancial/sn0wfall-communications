const socket = io();

// --- OS & App State ---
let currentUser = "";
let activeTarget = "global"; // 'global', 'user_<name>', or 'group_<id>'
let pendingMediaData = null;
let activeCallPartner = null;
let isScreenSharing = false;

// --- App Navigation ---
function openApp(appId) {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(appId);
    if (target) target.classList.add("active");
}

function goHome() {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    document.getElementById("homeScreen").classList.add("active");
}

// --- Login & Clock ---
document.getElementById("enterAppBtn").onclick = () => {
    const val = document.getElementById("usernameInput").value.trim();
    if (!val) return alert("Enter a screen name.");
    currentUser = val.slice(0, 25);
    
    socket.emit("register-socket", currentUser);
    openApp("homeScreen");
};

function updateClock() {
    const now = new Date();
    document.getElementById("currentTime").textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// --- Media Pasting & Uploading ---
document.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf("image") === 0) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                pendingMediaData = { type: "image", data: event.target.result };
                document.getElementById("mediaPreviewImg").src = event.target.result;
                document.getElementById("mediaPreviewFilename").textContent = "Pasted_Image.png";
                document.getElementById("mediaPreviewContainer").style.display = "flex";
            };
            reader.readAsDataURL(blob);
        }
    }
});

document.getElementById("mediaInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    const isVideo = file.type.startsWith("video/");
    reader.onload = (event) => {
        pendingMediaData = { type: isVideo ? "video" : "image", data: event.target.result };
        document.getElementById("mediaPreviewImg").src = isVideo ? "" : event.target.result;
        document.getElementById("mediaPreviewFilename").textContent = file.name;
        document.getElementById("mediaPreviewContainer").style.display = "flex";
    };
    reader.readAsDataURL(file);
};

document.getElementById("cancelMediaPreview").onclick = () => {
    pendingMediaData = null;
    document.getElementById("mediaInput").value = "";
    document.getElementById("mediaPreviewContainer").style.display = "none";
};

// --- Chat & Messaging Engine ---
function sendMessage() {
    const text = document.getElementById("messageInput").value.trim();
    if (!text && !pendingMediaData) return;

    const payload = {
        text,
        media: pendingMediaData ? pendingMediaData.data : null,
        mediaType: pendingMediaData ? pendingMediaData.type : null
    };

    if (activeTarget === "global") {
        socket.emit("message", payload);
    } else if (activeTarget.startsWith("user_")) {
        const recipient = activeTarget.replace("user_", "");
        socket.emit("private-message", { to: recipient, msg: payload });
        renderBubble({ sender: currentUser, ...payload }, true);
    } else if (activeTarget.startsWith("group_")) {
        socket.emit("group-message", { groupId: activeTarget, msg: payload });
    }

    document.getElementById("messageInput").value = "";
    document.getElementById("cancelMediaPreview").click();
}

document.getElementById("sendBtn").onclick = sendMessage;
document.getElementById("messageInput").addEventListener("keydown", (e) => { 
    if (e.key === "Enter") sendMessage(); 
});

socket.on("message", (msg) => {
    if (activeTarget === "global") renderBubble(msg, msg.sender === currentUser);
});

socket.on("private-message", ({ from, msg }) => {
    if (activeTarget === `user_${from.toLowerCase()}`) {
        renderBubble({ sender: from, ...msg }, false);
    } else {
        showToast(`🔒 DM from ${from}`);
    }
});

socket.on("group-message", ({ groupId, sender, msg }) => {
    if (activeTarget === groupId) {
        renderBubble({ sender, ...msg }, sender === currentUser);
    }
});

function renderBubble(msg, isMine) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${isMine ? "mine" : "theirs"}`;

    let content = `<span class="bubble-author">${msg.sender || "Anon"}</span>`;

    if (msg.media) {
        if (msg.mediaType === "video") {
            content += `<video src="${msg.media}" controls style="max-width:100%; border-radius:10px;"></video>`;
        } else {
            content += `<img src="${msg.media}" style="max-width:100%; border-radius:10px;">`;
        }
    }

    if (msg.text) content += `<p class="msg-text">${msg.text}</p>`;

    bubble.innerHTML = content;
    const chat = document.getElementById("chatMessages");
    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;
}

// --- Contacts & Group Management ---
socket.on("user-list", (users) => {
    const list = document.getElementById("contactsList");
    list.innerHTML = "";
    users.forEach(u => {
        if (u.toLowerCase() !== currentUser.toLowerCase()) {
            list.innerHTML += `<div class="contact-item">
                <strong>👤 ${u}</strong>
                <button onclick="switchChatTarget('user_${u}')" class="primary-btn">DM</button>
            </div>`;
        }
    });
});

document.getElementById("createGroupBtn").onclick = () => {
    const groupName = prompt("Enter Group Name:");
    if (!groupName) return;
    const membersInput = prompt("Enter member usernames (comma separated):");
    const members = membersInput ? membersInput.split(",") : [];
    socket.emit("create-group", { groupName, members });
};

socket.on("group-created", ({ groupId, groupName }) => {
    const gList = document.getElementById("groupsList");
    gList.innerHTML += `<div class="contact-item">
        <strong>👥 ${groupName}</strong>
        <button onclick="switchChatTarget('${groupId}', '${groupName}')" class="primary-btn">Chat</button>
    </div>`;
});

function switchChatTarget(target, nameOverride = "") {
    activeTarget = target;
    document.getElementById("chatMessages").innerHTML = "";
    
    if (target === "global") {
        document.getElementById("chatTitle").textContent = "❄️ Global";
    } else if (target.startsWith("user_")) {
        document.getElementById("chatTitle").textContent = `🔒 DM: ${target.replace("user_", "")}`;
    } else if (target.startsWith("group_")) {
        document.getElementById("chatTitle").textContent = `👥 Group: ${nameOverride}`;
    }
    openApp("chatApp");
}

// --- WebRTC Video Calling Engine ---
let localStream = null;
let peer = null;

async function startCall(isScreen = false) {
    const target = prompt("Enter username to call:");
    if (!target) return;
    activeCallPartner = target;
    isScreenSharing = isScreen;

    try {
        if (isScreen) {
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } else {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        document.getElementById("localVideo").srcObject = localStream;
        document.getElementById("callOverlay").style.display = "flex";
        socket.emit("call-user", { targetUser: target, isScreenShare: isScreen });
    } catch (err) {
        alert("Camera/Microphone access denied or unavailable.");
    }
}

document.getElementById("callBtn").onclick = () => startCall(false);
document.getElementById("shareScreenBtn").onclick = () => startCall(true);

document.getElementById("hangupBtn").onclick = () => {
    if (activeCallPartner) socket.emit("hangup-call", { to: activeCallPartner });
    closeCall();
};

function closeCall() {
    if (peer) peer.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    document.getElementById("callOverlay").style.display = "none";
    activeCallPartner = null;
}

socket.on("incoming-call", ({ from }) => {
    activeCallPartner = from;
    document.getElementById("callerName").textContent = from;
    document.getElementById("callBanner").style.display = "flex";
});

document.getElementById("acceptCallBtn").onclick = async () => {
    document.getElementById("callBanner").style.display = "none";
    document.getElementById("callOverlay").style.display = "flex";
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;
    socket.emit("accept-call", { to: activeCallPartner });
};

document.getElementById("declineCallBtn").onclick = () => {
    document.getElementById("callBanner").style.display = "none";
    socket.emit("decline-call", { to: activeCallPartner });
    activeCallPartner = null;
};

socket.on("call-ended", () => {
    alert("Call ended.");
    closeCall();
});

// --- Fixed Calculator Logic ---
const calcDisplay = document.getElementById("calcDisplay");
function calcInput(val) {
    if (calcDisplay.value === "0" || calcDisplay.value === "Error") calcDisplay.value = "";
    if (val === "C") { calcDisplay.value = "0"; return; }
    calcDisplay.value += val;
}
function calcEquals() {
    try {
        // Safe evaluation stripping out dangerous characters
        const sanitized = calcDisplay.value.replace(/[^-()\d/*+.]/g, '');
        calcDisplay.value = new Function(`return ${sanitized}`)();
    } catch {
        calcDisplay.value = "Error";
    }
}

// --- Arcade Games Hub ---
function launchWebGame(gameKey) {
    const urls = {
        tictactoe: "https://playtictactoe.org/",
        sudoku: "https://sudoku.com/",
        chess: "https://www.chess.com/play/computer",
        "2048": "https://play2048.co/",
        wordle: "https://www.nytimes.com/games/wordle/index.html",
        minesweeper: "https://minesweeper.online/"
    };
    if (!urls[gameKey]) return;
    document.getElementById("arcadeList").style.display = "none";
    document.getElementById("gameIframe").src = urls[gameKey];
    document.getElementById("activeGameContainer").style.display = "flex";
}

function closeGame() {
    document.getElementById("gameIframe").src = "";
    document.getElementById("activeGameContainer").style.display = "none";
    document.getElementById("arcadeList").style.display = "grid";
}

// --- Settings & UI Logic ---
const backgrounds = {
    default: "var(--bg-gradient)",
    mountain: "url('https://images.unsplash.com/photo-1517299321609-52687d1bc55a?w=1080&q=80') center/cover",
    cherry: "url('https://images.unsplash.com/photo-1493957988430-a5f2e15f39a3?w=1080&q=80') center/cover",
    forest: "url('https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?w=1080&q=80') center/cover",
    space: "url('https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1080&q=80') center/cover"
};

document.getElementById("bgSelect").onchange = (e) => {
    document.body.style.background = backgrounds[e.target.value];
    document.getElementById("bgDarkModeToggle").checked = false;
};

document.getElementById("brightnessSlider").oninput = (e) => {
    document.getElementById("phoneScreen").style.filter = `brightness(${e.target.value}%)`;
};

document.getElementById("uiDarkModeToggle").onchange = (e) => {
    document.body.classList.toggle("ui-dark-mode", e.target.checked);
};

document.getElementById("bgDarkModeToggle").onchange = (e) => {
    document.body.style.background = e.target.checked ? "#000000" : backgrounds[document.getElementById("bgSelect").value];
};

document.getElementById("disableSnowToggle").onchange = (e) => {
    document.getElementById("snow").style.display = e.target.checked ? "none" : "block";
};

document.getElementById("bubbleColorPicker").oninput = (e) => {
    document.documentElement.style.setProperty("--bubble-mine", e.target.value);
};

function showToast(msg) {
    const toast = document.getElementById("toastNotification");
    toast.textContent = msg;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 3000);
}

// Snow Flake Generation Engine
const snow = document.getElementById("snow");
const flakes = ["❄", "❅", "❆"];
for (let i = 0; i < 35; i++) {
    const flake = document.createElement("div");
    flake.className = "snowflake";
    flake.textContent = flakes[Math.floor(Math.random() * flakes.length)];
    flake.style.left = Math.random() * 100 + "%";
    flake.style.fontSize = (Math.random() * 16 + 10) + "px";
    flake.style.animationDuration = (Math.random() * 10 + 6) + "s";
    flake.style.animationDelay = (-Math.random() * 10) + "s";
    snow.appendChild(flake);
}
