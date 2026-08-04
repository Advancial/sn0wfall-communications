const socket = io();


const login=document.getElementById("login");
const chatBox=document.getElementById("chatBox");

const password=document.getElementById("password");
const join=document.getElementById("join");

const chat=document.getElementById("chat");

const message=document.getElementById("message");
const send=document.getElementById("send");

const image=document.getElementById("image");

const call=document.getElementById("call");


let myName="";



join.onclick=()=>{

myName=
prompt("Your name?") || "Friend";


socket.emit(
"join",
password.value
);


};



socket.on("access",(ok)=>{

if(ok){

login.style.display="none";

chatBox.style.display="flex";

}

else{

alert("Wrong password");

}

});





function sendMessage(){


if(message.value.trim()){


socket.emit(
"message",
{

name:myName,

type:"text",

text:message.value

});


message.value="";


}



if(image.files.length){


let reader=new FileReader();


reader.onload=()=>{


socket.emit(
"message",
{

name:myName,

type:"image",

image:reader.result

});


};


reader.readAsDataURL(image.files[0]);


image.value="";


}



}



send.onclick=sendMessage;


message.addEventListener(
"keydown",
(e)=>{

if(e.key==="Enter"){

sendMessage();

}

});





socket.on("message",(msg)=>{


let bubble=document.createElement("div");

bubble.className="bubble";


bubble.classList.add(
msg.name===myName?
"mine":
"theirs"
);



if(msg.type==="image"){

bubble.innerHTML=
`
<strong>${msg.name}</strong>
<br>
<img class="sentImage" src="${msg.image}">
`;

}

else{


bubble.innerHTML=
`
<strong>${msg.name}</strong>
<br>
${msg.text}
`;

}


chat.appendChild(bubble);


chat.scrollTop=chat.scrollHeight;


});
// Snow generator ❄️

const snow = document.getElementById("snow");

const flakes = [
    "❄",
    "❅",
    "❆",
    "✦"
];


for(let i = 0; i < 45; i++){

    const flake = document.createElement("div");

    flake.className="snowflake";

    flake.textContent =
        flakes[Math.floor(Math.random()*flakes.length)];


    flake.style.left =
        Math.random()*100 + "%";


    let size =
        Math.random()*18 + 10;


    flake.style.fontSize =
        size + "px";


    flake.style.animationDuration =
        (Math.random()*12+8)+"s";


    flake.style.animationDelay =
        (-Math.random()*20)+"s";


    snow.appendChild(flake);

}
// =======================
// Voice Calling
// =======================

let localStream;
let peer;

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

async function createPeer() {

    peer = new RTCPeerConnection(rtcConfig);

    peer.onicecandidate = (event) => {

        if(event.candidate){

            socket.emit("ice-candidate", event.candidate);

        }

    };

    peer.ontrack = (event) => {

        let audio = document.getElementById("remoteAudio");

        if(!audio){

            audio = document.createElement("audio");
            audio.id = "remoteAudio";
            audio.autoplay = true;
            document.body.appendChild(audio);

        }

        audio.srcObject = event.streams[0];

    };

    if(!localStream){

        localStream = await navigator.mediaDevices.getUserMedia({
            audio:true
        });

    }

    localStream.getTracks().forEach(track=>{
        peer.addTrack(track,localStream);
    });

}

call.onclick = async ()=>{

    await createPeer();

    const offer = await peer.createOffer();

    await peer.setLocalDescription(offer);

    socket.emit("call-user");

    socket.emit("offer",offer);

};

socket.on("incoming-call",()=>{

    console.log("Incoming call...");

});

socket.on("offer",async(offer)=>{

    await createPeer();

    await peer.setRemoteDescription(
        new RTCSessionDescription(offer)
    );

    const answer = await peer.createAnswer();

    await peer.setLocalDescription(answer);

    socket.emit("answer",answer);

});

socket.on("answer",async(answer)=>{

    if(peer){

        await peer.setRemoteDescription(
            new RTCSessionDescription(answer)
        );

    }

});

socket.on("ice-candidate",async(candidate)=>{

    if(peer){

        try{

            await peer.addIceCandidate(
                new RTCIceCandidate(candidate)
            );

        }

        catch(err){

            console.error(err);

        }

    }

});
