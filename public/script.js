const socket = io();

// --- OS & App State ---
let currentUser = "";
let activeTarget = "global"; 
let pendingMediaData = null;
let activeCallPartner = null;
let isScreenSharing = false;
let dmHistory = new Set(); // Stores recent contacts temporarily
let notesContent = ""; // Stores notes temporarily until refresh
let isPoweredOff = false;

// --- App Navigation & System ---
function openApp(appId) {
    if(isPoweredOff) return;
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(appId);
    if (target) target.classList.add("active");
    
    if(appId === 'catsApp') fetchCat();
    if(appId === 'notesApp') document.getElementById('notesInput').value = notesContent;
    if(appId === 'contactsApp') renderRecentContacts();
}

function goHome() {
    if(isPoweredOff) return;
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    document.getElementById("homeScreen").classList.add("active");
}

function togglePower() {
    isPoweredOff = !isPoweredOff;
    document.getElementById("powerOffScreen").style.display = isPoweredOff ? "block" : "none";
    if(!isPoweredOff) goHome();
}

// Save notes to memory on input
document.getElementById('notesInput').addEventListener('input', (e) => {
    notesContent = e.target.value;
});

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
        document.getElementById("mediaPreviewImg").src = isVideo ? "" :
