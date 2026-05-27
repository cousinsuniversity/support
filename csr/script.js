// ==================== FIREBASE CONFIG ====================
const supportFirebaseConfig = {
  apiKey: "AIzaSyB-f_fQ3OlB5kDqQsNVsTr5X6fs06AHRGQ",
  authDomain: "class-learn-support.firebaseapp.com",
  databaseURL: "https://class-learn-support-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "class-learn-support",
  storageBucket: "class-learn-support.firebasestorage.app",
  messagingSenderId: "769978864199",
  appId: "1:769978864199:web:998023f57d8486e8a09762"
};

firebase.initializeApp(supportFirebaseConfig);
const database = firebase.database();

const csrAccountsRef = database.ref('csrAccounts');
const csrStatusRef = database.ref('csrStatus');
const chatQueueRef = database.ref('chatQueue');
const callQueueRef = database.ref('callQueue');

let csrId = null;
let csrName = '';
let csrEmail = '';
let isOnline = false;
let currentChatId = null;
let currentCallId = null;
let chatListener = null;
let callListener = null;
let audioListener = null;
let isMuted = false;
let selectedChatRow = null;
let selectedCallRow = null;
let localStream = null;
let peerConnection = null;
let audioContext = null;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ==================== AUTH ====================
function switchAuthTab(tab) {
    document.getElementById('loginTab').classList.toggle('active', tab === 'login');
    document.getElementById('registerTab').classList.toggle('active', tab === 'register');
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('registerError').style.display = 'none';
}

function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errDiv = document.getElementById('loginError');
    
    if (!email || !password) { errDiv.style.display = 'block'; errDiv.textContent = 'Please fill all fields'; return; }
    
    const btn = document.getElementById('loginBtn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    
    csrAccountsRef.orderByChild('email').equalTo(email).once('value')
        .then(snapshot => {
            if (snapshot.exists()) {
                snapshot.forEach(child => {
                    const account = child.val();
                    if (account.password === password) {
                        csrId = child.key;
                        csrName = account.name;
                        csrEmail = account.email;
                        showDashboard();
                        return;
                    }
                });
                if (!csrId) { errDiv.style.display = 'block'; errDiv.textContent = 'Invalid credentials'; }
            } else {
                errDiv.style.display = 'block'; errDiv.textContent = 'Account not found';
            }
        })
        .catch(error => { errDiv.style.display = 'block'; errDiv.textContent = 'Error: ' + error.message; })
        .finally(() => { btn.disabled = false; btn.textContent = 'Sign In'; });
}

function handleRegister() {
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const employeeId = document.getElementById('regEmployeeId').value.trim();
    const errDiv = document.getElementById('registerError');
    const sucDiv = document.getElementById('registerSuccess');
    
    errDiv.style.display = 'none'; sucDiv.style.display = 'none';
    if (!name || !email || !password || !employeeId) { errDiv.style.display = 'block'; errDiv.textContent = 'Please fill all fields'; return; }
    if (password.length < 6) { errDiv.style.display = 'block'; errDiv.textContent = 'Password must be 6+ characters'; return; }
    
    const btn = document.getElementById('registerBtn');
    btn.disabled = true; btn.textContent = 'Creating...';
    
    csrAccountsRef.push({
        name, email, password, employeeId,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        sucDiv.style.display = 'block'; sucDiv.textContent = 'Registration successful! Please login.';
        setTimeout(() => switchAuthTab('login'), 1500);
    }).catch(error => {
        errDiv.style.display = 'block'; errDiv.textContent = 'Error: ' + error.message;
    }).finally(() => { btn.disabled = false; btn.textContent = 'Create Account'; });
}

function handleLogout() {
    if (isOnline) setOnlineStatus(false);
    endCurrentChat();
    endCurrentCall();
    csrId = null; csrName = ''; csrEmail = ''; isOnline = false;
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
    showToast('Logged out', 'info');
}

// ==================== DASHBOARD ====================
function showDashboard() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'block';
    document.getElementById('csrInfo').textContent = csrName + ' - ' + csrEmail;
    setOnlineStatus(true);
    loadChatQueue();
    loadCallQueue();
}

function toggleOnlineStatus() {
    if (isOnline) { setOnlineStatus(false); }
    else { setOnlineStatus(true); }
}

function setOnlineStatus(online) {
    if (!csrId) return;
    isOnline = online;
    
    csrStatusRef.child(csrId).update({
        status: online ? 'online' : 'offline',
        lastUpdated: firebase.database.ServerValue.TIMESTAMP,
        name: csrName
    });
    
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const toggleBtn = document.getElementById('toggleOnlineBtn');
    
    if (online) {
        indicator.className = 'status-indicator status-online';
        statusText.textContent = 'Online';
        toggleBtn.textContent = 'Go Offline';
        toggleBtn.className = 'btn btn-danger';
    } else {
        indicator.className = 'status-indicator status-offline';
        statusText.textContent = 'Offline';
        toggleBtn.textContent = 'Go Online';
        toggleBtn.className = 'btn btn-success';
    }
}

// ==================== CHAT QUEUE ====================
function loadChatQueue() {
    chatQueueRef.orderByChild('status').equalTo('waiting').on('value', snapshot => {
        const tbody = document.getElementById('chatQueueBody');
        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px;">No waiting chats</td></tr>';
            return;
        }
        let html = '';
        snapshot.forEach(child => {
            const chat = child.val();
            html += `<tr data-id="${child.key}" onclick="selectChatRow(this, '${child.key}')" class="${selectedChatRow === child.key ? 'selected' : ''}">
                <td>${chat.studentName || 'Unknown'}</td>
                <td>${chat.studentEmail || ''}</td>
                <td>${chat.status || 'waiting'}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    });
}

function selectChatRow(row, chatId) {
    document.querySelectorAll('#chatQueueBody tr').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    selectedChatRow = chatId;
}

function acceptChat() {
    if (!selectedChatRow) { showToast('Please select a chat request', 'error'); return; }
    
    currentChatId = selectedChatRow;
    chatQueueRef.child(currentChatId).update({
        status: 'connected',
        csrId: csrId,
        csrName: csrName,
        connectedAt: firebase.database.ServerValue.TIMESTAMP
    });
    
    document.getElementById('acceptChatBtn').disabled = true;
    document.getElementById('endChatBtn').disabled = false;
    document.getElementById('csrChatInput').disabled = false;
    document.getElementById('csrChatSendBtn').disabled = false;
    
    listenForChatMessages(currentChatId);
    showToast('Chat connected', 'success');
}

function listenForChatMessages(chatId) {
    if (chatListener) chatQueueRef.child(currentChatId).child('messages').off('value', chatListener);
    
    chatListener = chatQueueRef.child(chatId).child('messages').on('value', snapshot => {
        const messages = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => { messages.push(child.val()); });
        }
        renderCSRChatMessages(messages);
    });
}

function renderCSRChatMessages(messages) {
    const cm = document.getElementById('csrChatMessages');
    if (messages.length === 0) {
        cm.innerHTML = '<div class="empty-state"><i class="fas fa-comment-dots"></i><p>No messages yet</p></div>';
        return;
    }
    let h = '';
    messages.forEach(msg => {
        const cls = msg.sender === 'student' ? 'student' : 'csr';
        const avCls = msg.sender === 'student' ? 'student' : 'csr-av';
        const initial = msg.sender === 'student' ? 'S' : (csrName || 'C').charAt(0);
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
        h += `<div class="chat-message ${cls}">
            <div class="chat-avatar ${avCls}">${initial}</div>
            <div>
                <div class="chat-bubble">${msg.text}</div>
                <div class="chat-time">${time}</div>
            </div>
        </div>`;
    });
    cm.innerHTML = h;
    cm.scrollTop = cm.scrollHeight;
}

function sendCSRChatMessage() {
    const input = document.getElementById('csrChatInput');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    
    chatQueueRef.child(currentChatId).child('messages').push({
        sender: 'csr',
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    input.value = '';
}

function endCurrentChat() {
    if (currentChatId) {
        chatQueueRef.child(currentChatId).update({ status: 'ended', endedAt: firebase.database.ServerValue.TIMESTAMP });
        if (chatListener) { chatQueueRef.child(currentChatId).child('messages').off('value', chatListener); chatListener = null; }
        currentChatId = null;
    }
    document.getElementById('acceptChatBtn').disabled = false;
    document.getElementById('endChatBtn').disabled = true;
    document.getElementById('csrChatInput').disabled = true;
    document.getElementById('csrChatSendBtn').disabled = true;
    document.getElementById('csrChatMessages').innerHTML = '<div class="empty-state"><i class="fas fa-comment-dots"></i><p>Select a chat to start</p></div>';
    selectedChatRow = null;
    showToast('Chat ended', 'info');
}

// ==================== CALL QUEUE ====================
function loadCallQueue() {
    callQueueRef.orderByChild('status').equalTo('waiting').on('value', snapshot => {
        const tbody = document.getElementById('callQueueBody');
        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#999;padding:20px;">No waiting calls</td></tr>';
            return;
        }
        let html = '';
        snapshot.forEach(child => {
            const call = child.val();
            html += `<tr data-id="${child.key}" onclick="selectCallRow(this, '${child.key}')" class="${selectedCallRow === child.key ? 'selected' : ''}">
                <td>${call.studentName || 'Unknown'}</td>
                <td>${call.studentEmail || ''}</td>
                <td>${call.status || 'waiting'}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    });
}

function selectCallRow(row, callId) {
    document.querySelectorAll('#callQueueBody tr').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    selectedCallRow = callId;
}

async function acceptCall() {
    if (!selectedCallRow) { showToast('Please select a call request', 'error'); return; }
    
    currentCallId = selectedCallRow;
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        showToast('Microphone access denied', 'error');
        return;
    }
    
    callQueueRef.child(currentCallId).update({
        status: 'connected',
        csrId: csrId,
        csrName: csrName,
        connectedAt: firebase.database.ServerValue.TIMESTAMP
    });
    
    document.getElementById('acceptCallBtn').disabled = true;
    document.getElementById('csrMuteBtn').disabled = false;
    document.getElementById('endCallBtn').disabled = false;
    document.getElementById('csrCallStatus').textContent = 'Connected';
    
    setupWebRTC(currentCallId);
    listenForStudentAudio(currentCallId);
    showToast('Call connected', 'success');
}

async function setupWebRTC(callId) {
    if (peerConnection) { peerConnection.close(); }
    peerConnection = new RTCPeerConnection(configuration);
    
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            callQueueRef.child(callId).child('iceCandidates').child('csr').push({
                candidate: event.candidate.toJSON()
            });
        }
    };
    
    peerConnection.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
    };
    
    callQueueRef.child(callId).child('offer').on('value', async snapshot => {
        const offer = snapshot.val();
        if (offer && peerConnection && peerConnection.signalingState === 'stable') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await callQueueRef.child(callId).update({ answer: answer });
        }
    });
    
    callQueueRef.child(callId).child('iceCandidates').child('student').on('child_added', snapshot => {
        const data = snapshot.val();
        if (data?.candidate && peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
        }
    });
}

function listenForStudentAudio(callId) {
    if (audioListener) {
        callQueueRef.child(callId).child('studentAudioStream').off('child_added', audioListener);
    }
    
    audioListener = callQueueRef.child(callId).child('studentAudioStream').on('child_added', snapshot => {
        const audioData = snapshot.val();
        if (audioData?.data) {
            playBase64Audio(audioData.data);
        }
    });
}

ffunction playBase64Audio(base64Data) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        }
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        let bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i) & 0xFF; }
        
        if (bytes.length % 2 !== 0) {
            bytes = bytes.slice(0, bytes.length - 1);
        }
        if (bytes.length < 2) return;
        
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) { float32[i] = pcm16[i] / 32768.0; }
        
        const buffer = audioContext.createBuffer(1, float32.length, 16000);
        buffer.getChannelData(0).set(float32);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
    } catch (e) { console.error('Audio playback error:', e); }
}

function toggleCSRMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const btn = document.getElementById('csrMuteBtn');
    btn.classList.toggle('active', isMuted);
    btn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
}

function endCurrentCall() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (currentCallId) {
        callQueueRef.child(currentCallId).update({ status: 'ended', endedAt: firebase.database.ServerValue.TIMESTAMP });
        if (audioListener) { callQueueRef.child(currentCallId).child('studentAudioStream').off('child_added', audioListener); audioListener = null; }
        currentCallId = null;
    }
    document.getElementById('acceptCallBtn').disabled = false;
    document.getElementById('csrMuteBtn').disabled = true;
    document.getElementById('endCallBtn').disabled = true;
    document.getElementById('csrCallStatus').textContent = 'No active call';
    isMuted = false;
    selectedCallRow = null;
    showToast('Call ended', 'info');
}

// ==================== TOAST ====================
function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
    toast.addEventListener('click', () => toast.remove());
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
});

window.addEventListener('beforeunload', () => {
    if (isOnline) setOnlineStatus(false);
    endCurrentChat();
    endCurrentCall();
});
