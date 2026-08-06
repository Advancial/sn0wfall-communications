const socket = io();

// --- OS & App State ---
let currentUser = "";
let activeTarget = "global"; // 'global', 'user_<name>', or 'group_<id>'
let pendingMediaData = null;
let replyTargetMsgId = null;
let activeCallPartner = null;
let isScreenSharing = false;

// Settings State
let settings = {
    darkMode: false,
    autoTranslate: false,
    disableSnow: false,
    autoShortenNames: false,
    bubbleColor: "#9bd7ff",
    bgColor: "#aacfff"
};

// --- DOM Elements ---
const authScreen = document.getElementById("authScreen");
const homeScreen = document.getElementById("homeScreen");
const usernameInput = document.getElementById("usernameInput");
const enterAppBtn = document.getElementById("enterAppBtn");
const currentTimeEl = document.getElementById("currentTime");

// Chat Elements
const chatTitle = document.getElementById("chatTitle");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const mediaInput = document.getElementById("mediaInput");
const sendBtn = document.getElementById("sendBtn");
const createGroupBtn = document.getElementById("createGroupBtn");
const callBtn = document.getElementById("callBtn");

// Media Preview Elements
const mediaPreviewContainer = document.getElementById("mediaPreviewContainer");
const mediaPreviewImg = document.getElementById("mediaPreviewImg");
const mediaPreviewFilename = document.getElementById("mediaPreviewFilename");
const cancelMediaPreview = document.getElementById("cancelMediaPreview");

// Settings Elements
const darkModeToggle = document.getElementById("darkModeToggle");
const autoTranslateToggle = document.getElementById("autoTranslateToggle");
const disableSnowToggle = document.getElementById("disableSnowToggle");
const autoShortenNamesToggle = document.getElementById("autoShortenNamesToggle");
const bubbleColorPicker = document.getElementById("bubbleColorPicker");
const bgColorPicker = document.getElementById("bgColorPicker");

// --- Initialization & Clock ---
function updateClock() {
    const now = new Date();
    currentTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// --- Username Entry (No Password Required) ---
enterAppBtn.onclick = () => {
    const val = usernameInput.value.trim();
    if (!val) return alert("Please enter a username.");
    currentUser = val.slice(0, 25);
    
    socket.emit("register-socket", currentUser);
    
    authScreen.classList.remove("active");
    homeScreen.classList.add("active");
};

// --- OS Navigation & Apps ---
function openApp(appId) {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(appId);
    if (target) target.classList.add("active");
}

function goHome() {
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    homeScreen.classList.add("active");
}

function powerOffPhone() {
    if (confirm("Turn off Snowfall OS?")) {
        window.close();
        document.body.innerHTML = "<div style='color:white;text-align:center;margin-top:40vh;'><h2>Device Powered Off</h2></div>";
    }
}

// --- Image Pasting Preview & Upload Handling ---
document.addEventListener("paste", (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf("image") === 0) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                pendingMediaData = {
                    type: "image",
                    data: event.target.result
                };
                mediaPreviewImg.src = event.target.result;
                mediaPreviewFilename.textContent = "Pasted_Image.png";
                mediaPreviewContainer.style.display = "flex";
            };
            reader.readAsDataURL(blob);
        }
    }
});

mediaInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    const isVideo = file.type.startsWith("video/");
    reader.onload = (event) => {
        pendingMediaData = {
            type: isVideo ? "video" : "image",
            data: event.target.result
        };
        mediaPreviewImg.src = isVideo ? "" : event.target.result;
        mediaPreviewFilename.textContent = file.name;
        mediaPreviewContainer.style.display = "flex";
    };
    reader.readAsDataURL(file);
};

cancelMediaPreview.onclick = () => {
    pendingMediaData = null;
    mediaInput.value = "";
    mediaPreviewContainer.style.display = "none";
};

// --- Formatting Helper (Auto-Shorten Names) ---
function formatName(name) {
    if (settings.autoShortenNames && name.length > 5) {
        return name.slice(0, 5) + "..";
    }
    return name;
}

// --- Message Dispatching ---
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !pendingMediaData) return;

    const payload = {
        text,
        media: pendingMediaData ? pendingMediaData.data : null,
        mediaType: pendingMediaData ? pendingMediaData.type : null,
        replyTo: replyTargetMsgId
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

    messageInput.value = "";
    cancelMediaPreview.click();
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

// Socket Message Listeners
socket.on("message", (msg) => {
    if (activeTarget === "global") renderBubble(msg, msg.sender === currentUser);
});

socket.on("private-message", ({ from, msg }) => {
    if (activeTarget === `user_${from.toLowerCase()}`) {
        renderBubble({ sender: from, ...msg }, false);
    } else {
        showToast(`🔒 Direct message from ${formatName(from)}`);
    }
});

socket.on("group-message", ({ groupId, sender, msg }) => {
    if (activeTarget === groupId) {
        renderBubble({ sender, ...msg }, sender === currentUser);
    }
});

// Render Chat Bubble
function renderBubble(msg, isMine) {
    const bubble = document.createElement("div");
    bubble.className = `bubble ${isMine ? "mine" : "theirs"}`;
    bubble.dataset.id = msg.id || Date.now();

    let authorSpan = `<span class="bubble-author">${formatName(msg.sender || "Anon")}</span>`;
    let content = authorSpan;

    if (msg.media) {
        if (msg.mediaType === "video") {
            content += `<video src="${msg.media}" controls style="max-width:100%; border-radius:10px;"></video>`;
        } else {
            content += `<img src="${msg.media}" style="max-width:100%; border-radius:10px;">`;
        }
    }

    if (msg.text) {
        content += `<p class="msg-text">${msg.text}</p>`;
    }

    // Action overlay (Edit/Delete/React)
    content += `
        <div class="msg-actions">
            <button onclick="reactMsg('${bubble.dataset.id}', '❤️')">❤️</button>
            <button onclick="reactMsg('${bubble.dataset.id}', '😂')">😂</button>
            ${isMine ? `<button onclick="editMsg('${bubble.dataset.id}')">✏️</button>` : ""}
            ${isMine ? `<button onclick="deleteMsg('${bubble.dataset.id}')">🗑️</button>` : ""}
        </div>
        <div class="reaction-bar" id="reactions-${bubble.dataset.id}"></div>
    `;

    bubble.innerHTML = content;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Group Chat Creation
createGroupBtn.onclick = () => {
    const groupName = prompt("Enter Group Name:");
    if (!groupName) return;
    const membersInput = prompt("Enter member usernames (comma separated, max 90):");
    const members = membersInput ? membersInput.split(",") : [];
    
    socket.emit("create-group", { groupName, members });
};

socket.on("group-created", ({ groupId, groupName }) => {
    showToast(`Group "${groupName}" Created!`);
});

// --- WebRTC Video & Screen Share Calling Engine ---
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
        alert("Camera/Microphone/Screen access denied or unavailable.");
    }
}

callBtn.onclick = () => startCall(false);
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
    document.getElementById("callerName").textContent = formatName(from);
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
    alert("Call ended by partner.");
    closeCall();
});

// --- Contacts App Population ---
socket.on("user-list", (users) => {
    const list = document.getElementById("contactsList");
    list.innerHTML = "";
    users.forEach(u => {
        if (u.toLowerCase() !== currentUser.toLowerCase()) {
            const item = document.createElement("div");
            item.style.cssText = "padding: 10px; background: white; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;";
            item.innerHTML = `
                <strong>${formatName(u)}</strong>
                <button onclick="switchChatTarget('user_${u}')" style="background:#8ccfff; border:none; padding:6px 12px; border-radius:12px; color:white; cursor:pointer;">DM</button>
            `;
            list.appendChild(item);
        }
    });
});

function switchChatTarget(target) {
    activeTarget = target;
    chatMessages.innerHTML = "";
    if (target === "global") {
        chatTitle.textContent = "❄️ Global Chat";
    } else if (target.startsWith("user_")) {
        chatTitle.textContent = `🔒 DM: ${formatName(target.replace("user_", ""))}`;
    }
    openApp("chatApp");
}

// --- Arcade Games Logic ---
function launchGame(gameId) {
    document.getElementById("activeGameContainer").style.display = "block";
    const board = document.getElementById("gameBoard");
    board.innerHTML = `<h3>Playing ${gameId.toUpperCase()}</h3><div style="padding:20px; text-align:center;">Game Board initialized. Ready to play!</div>`;
}

function closeGame() {
    document.getElementById("activeGameContainer").style.display = "none";
}

// --- Cute Cats Feed ---
async function fetchNewCat() {
    const gallery = document.getElementById("catGallery");
    gallery.innerHTML = "<p>Loading cute cats...</p>";
    try {
        const res = await fetch("https://api.thecatapi.com/v1/images/search?limit=3");
        const data = await res.json();
        gallery.innerHTML = "";
        data.forEach(item => {
            const img = document.createElement("img");
            img.src = item.url;
            img.style.cssText = "width:100%; border-radius:14px; margin-bottom:10px;";
            gallery.appendChild(img);
        });
    } catch {
        gallery.innerHTML = "<p>Failed to load cat pictures.</p>";
    }
}

// --- Calculator Logic ---
function calcInput(val) {
    const disp = document.getElementById("calcDisplay");
    if (disp.value === "0" || disp.value === "Error") disp.value = "";
    if (val === "C") { disp.value = "0"; return; }
    disp.value += val;
}

function calcEquals() {
    const disp = document.getElementById("calcDisplay");
    try {
        disp.value = eval(disp.value);
    } catch {
        disp.value = "Error";
    }
}

// --- Settings Handlers ---
darkModeToggle.onchange = (e) => {
    document.body.style.background = e.target.checked ? "#121212" : "var(--bg-gradient)";
};

disableSnowToggle.onchange = (e) => {
    document.getElementById("snow").style.display = e.target.checked ? "none" : "block";
};

autoShortenNamesToggle.onchange = (e) => {
    settings.autoShortenNames = e.target.checked;
};

bubbleColorPicker.oninput = (e) => {
    document.documentElement.style.setProperty("--bubble-mine", e.target.value);
};

bgColorPicker.oninput = (e) => {
    document.body.style.background = e.target.value;
};

// Toast Notifications
function showToast(msg) {
    const toast = document.getElementById("toastNotification");
    toast.textContent = msg;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 3000);
}

// Snow Effect Generation
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
