// ==================== FIREBASE CONFIGURATIONS ====================
const schoolFirebaseConfig = {
  apiKey: "AIzaSyDhE0CtfujSQoTjVTD7uNJXrEFaNyp4hzQ",
  authDomain: "school-enrollment-system-356e2.firebaseapp.com",
  databaseURL: "https://school-enrollment-system-356e2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-enrollment-system-356e2",
  storageBucket: "school-enrollment-system-356e2.firebasestorage.app",
  messagingSenderId: "445983385148",
  appId: "1:445983385148:web:55a608ebb987e2c7c94539"
};

const supportFirebaseConfig = {
  apiKey: "AIzaSyB-f_fQ3OlB5kDqQsNVsTr5X6fs06AHRGQ",
  authDomain: "class-learn-support.firebaseapp.com",
  databaseURL: "https://class-learn-support-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "class-learn-support",
  storageBucket: "class-learn-support.firebasestorage.app",
  messagingSenderId: "769978864199",
  appId: "1:769978864199:web:998023f57d8486e8a09762"
};

const schoolApp = firebase.initializeApp(schoolFirebaseConfig, "schoolApp");
const supportApp = firebase.initializeApp(supportFirebaseConfig, "supportApp");
const schoolDatabase = schoolApp.database();
const schoolAuth = schoolApp.auth();
const supportDatabase = supportApp.database();

const topicsRef = supportDatabase.ref('helpTopics');
const categoriesRef = supportDatabase.ref('helpCategories');
const chatQueueRef = supportDatabase.ref('chatQueue');
const callQueueRef = supportDatabase.ref('callQueue');
const csrStatusRef = supportDatabase.ref('csrStatus');
const supportTypesRef = supportDatabase.ref('supportTypes');
const studentsRef = schoolDatabase.ref('students');
const usersRef = schoolDatabase.ref('users');
const applicationsRef = schoolDatabase.ref('applications');

let allTopics = [];
let allCategories = [];
let selectedCategory = 'all';
let sortOrder = 'newest';
let currentChatId = null;
let currentCallId = null;
let chatListener = null;
let callListener = null;
let studentInfo = null;
let isMuted = false;
let callStartTime = null;
let callTimerInterval = null;
let currentSchoolUser = null;
let isAuthenticated = false;
let topicsLoaded = false;
let categoriesLoaded = false;
let currentTopicView = null;

let localStream = null;
let peerConnection = null;
let audioContext = null;
let audioStreamListener = null;
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('=== HELP & SUPPORT INITIALIZING ===');
    testDatabaseConnection();
    loadSupportTypes();
    loadCategories();
    loadTopics();
    setupEventListeners();
    monitorCSRStatus();
    updateAuthUI();
    checkUrlHash();
    
    const storedInfo = sessionStorage.getItem('studentInfo');
    if (storedInfo) {
        try {
            studentInfo = JSON.parse(storedInfo);
            isAuthenticated = true;
            updateAuthUI();
            displayUserInfo();
        } catch(e) {
            sessionStorage.removeItem('studentInfo');
        }
    }
    
    schoolAuth.onAuthStateChanged((user) => {
        if (user) {
            currentSchoolUser = user;
            isAuthenticated = true;
            loadStudentDataFromSchool(user);
        } else {
            if (!sessionStorage.getItem('studentInfo')) {
                currentSchoolUser = null;
                isAuthenticated = false;
                studentInfo = null;
                updateAuthUI();
                displayUserInfo();
            }
        }
    });
    
    window.addEventListener('hashchange', checkUrlHash);
});

function testDatabaseConnection() {
    supportDatabase.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {
            console.log('✅ Connected to support Firebase successfully!');
        } else {
            console.log('❌ Disconnected from support Firebase');
        }
    });
}

function checkUrlHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#topic/')) {
        const topicId = hash.replace('#topic/', '');
        showTopicDetail(topicId);
    } else {
        hideTopicDetail();
    }
}

function showTopicDetail(topicId) {
    const topic = allTopics.find(t => t.id === topicId);
    if (!topic) { window.location.hash = ''; return; }
    currentTopicView = topicId;
    const topicsGrid = document.getElementById('topicsGrid');
    const noTopics = document.getElementById('noTopics');
    const topicsTitle = document.getElementById('topicsTitle');
    const searchBar = document.querySelector('.search-bar');
    const sortBtn = document.getElementById('sortBtn');
    const topicsHeader = document.querySelector('.topics-header');
    let backNav = document.getElementById('topicBackNav');
    if (!backNav) {
        backNav = document.createElement('div');
        backNav.id = 'topicBackNav';
        backNav.style.cssText = 'margin-bottom:20px; display:none;';
        if (topicsHeader && topicsHeader.parentNode) topicsHeader.parentNode.insertBefore(backNav, topicsHeader);
    }
    backNav.innerHTML = '<button id="backToTopicsBtn" style="background:#f0f0f0;border:none;padding:10px 20px;border-radius:25px;cursor:pointer;font-size:14px;font-weight:600;color:#333;"><i class="fas fa-arrow-left"></i> Back to Topics</button>';
    backNav.style.display = 'block';
    document.getElementById('backToTopicsBtn').addEventListener('click', () => { window.location.hash = ''; hideTopicDetail(); });
    if (searchBar) searchBar.style.display = 'none';
    if (sortBtn) sortBtn.style.display = 'none';
    if (noTopics) noTopics.style.display = 'none';
    if (topicsTitle) topicsTitle.innerHTML = '<i class="fas fa-file-alt" style="color:var(--primary);"></i> ' + (topic.title || 'Untitled');
    const createdDate = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';
    const tagsHtml = (topic.tags || []).map(tag => '<span style="background:#e9ecef;padding:4px 12px;border-radius:15px;font-size:13px;margin-right:5px;">#' + tag + '</span>').join('');
    topicsGrid.innerHTML = '<div style="background:white;border-radius:12px;padding:30px;"><h2>' + (topic.title || 'Untitled') + '</h2><p>' + (topic.description || '') + '</p><div>' + (topic.content || '') + '</div></div>';
    incrementViewCount(topicId);
}

function hideTopicDetail() {
    currentTopicView = null;
    const searchBar = document.querySelector('.search-bar');
    const sortBtn = document.getElementById('sortBtn');
    const backNav = document.getElementById('topicBackNav');
    if (searchBar) searchBar.style.display = '';
    if (sortBtn) sortBtn.style.display = '';
    if (backNav) backNav.style.display = 'none';
    filterAndRenderTopics();
}

function showLoginModal() {
    const existingModal = document.getElementById('loginModalOverlay');
    if (existingModal) existingModal.remove();
    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;';
    overlay.innerHTML = '<div style="background:white;border-radius:15px;padding:30px;max-width:400px;width:90%;"><h3>School Portal Login</h3><div id="loginError" style="display:none;background:#f8d7da;color:#721c24;padding:10px;border-radius:8px;margin-bottom:15px;"></div><input type="email" id="loginEmailInput" placeholder="Email" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #dee2e6;border-radius:10px;box-sizing:border-box;"><input type="password" id="loginPasswordInput" placeholder="Password" style="width:100%;padding:12px;margin-bottom:15px;border:2px solid #dee2e6;border-radius:10px;box-sizing:border-box;"><button id="loginSubmitBtn" style="width:100%;padding:12px;background:#1a73e8;color:white;border:none;border-radius:10px;cursor:pointer;margin-bottom:10px;">Sign In</button><button id="loginCancelBtn" style="width:100%;padding:10px;background:transparent;color:#666;border:1px solid #dee2e6;border-radius:10px;cursor:pointer;">Cancel</button><p style="text-align:center;margin-top:15px;font-size:12px;">Dont have an account? <a href="#" id="switchToRegisterLink" style="color:#1a73e8;">Register here</a></p></div>';
    document.body.appendChild(overlay);
    document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmailInput').value.trim();
        const password = document.getElementById('loginPasswordInput').value;
        if (!email || !password) { document.getElementById('loginError').style.display = 'block'; document.getElementById('loginError').textContent = 'Please enter both email and password.'; return; }
        try { await schoolAuth.signInWithEmailAndPassword(email, password); overlay.remove(); showToast('Login successful!', 'success'); }
        catch (error) { document.getElementById('loginError').style.display = 'block'; document.getElementById('loginError').textContent = 'Login failed.'; }
    });
    document.getElementById('loginCancelBtn').addEventListener('click', () => overlay.remove());
    document.getElementById('switchToRegisterLink').addEventListener('click', (e) => { e.preventDefault(); overlay.remove(); showRegisterModal(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showRegisterModal() {
    const existingModal = document.getElementById('loginModalOverlay');
    if (existingModal) existingModal.remove();
    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;';
    overlay.innerHTML = '<div style="background:white;border-radius:15px;padding:30px;max-width:400px;width:90%;"><h3>Create Account</h3><div id="registerError" style="display:none;background:#f8d7da;color:#721c24;padding:10px;border-radius:8px;margin-bottom:15px;"></div><input type="text" id="registerNameInput" placeholder="Full Name" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #dee2e6;border-radius:10px;box-sizing:border-box;"><input type="email" id="registerEmailInput" placeholder="Email" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #dee2e6;border-radius:10px;box-sizing:border-box;"><input type="password" id="registerPasswordInput" placeholder="Password" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid #dee2e6;border-radius:10px;box-sizing:border-box;"><input type="password" id="registerConfirmPasswordInput" placeholder="Confirm Password" style="width:100%;padding:12px;margin-bottom:15px;border:2px solid #dee2e6;border-radius:10px;box-sizing:border-box;"><button id="registerSubmitBtn" style="width:100%;padding:12px;background:#28a745;color:white;border:none;border-radius:10px;cursor:pointer;margin-bottom:10px;">Create Account</button><button id="registerCancelBtn" style="width:100%;padding:10px;background:transparent;color:#666;border:1px solid #dee2e6;border-radius:10px;cursor:pointer;">Cancel</button></div>';
    document.body.appendChild(overlay);
    document.getElementById('registerSubmitBtn').addEventListener('click', async () => {
        const name = document.getElementById('registerNameInput').value.trim();
        const email = document.getElementById('registerEmailInput').value.trim();
        const password = document.getElementById('registerPasswordInput').value;
        const confirm = document.getElementById('registerConfirmPasswordInput').value;
        if (!name || !email || !password || !confirm) { document.getElementById('registerError').style.display = 'block'; document.getElementById('registerError').textContent = 'Please fill all fields.'; return; }
        if (password !== confirm) { document.getElementById('registerError').style.display = 'block'; document.getElementById('registerError').textContent = 'Passwords do not match.'; return; }
        try { await schoolAuth.createUserWithEmailAndPassword(email, password); overlay.remove(); showLoginModal(); showToast('Account created!', 'success'); }
        catch (error) { document.getElementById('registerError').style.display = 'block'; document.getElementById('registerError').textContent = 'Registration failed.'; }
    });
    document.getElementById('registerCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function handleLogout() {
    schoolAuth.signOut().then(() => {
        sessionStorage.removeItem('studentInfo');
        currentSchoolUser = null; isAuthenticated = false; studentInfo = null;
        updateAuthUI(); displayUserInfo(); showToast('Logged out', 'info');
    });
}

function updateAuthUI() {
    const liveChatBtn = document.getElementById('liveChatBtn');
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const contactSection = document.querySelector('.contact-support-section');
    if (isAuthenticated && studentInfo) {
        if (liveChatBtn) { liveChatBtn.disabled = false; liveChatBtn.style.opacity = '1'; liveChatBtn.style.cursor = 'pointer'; }
        if (voiceCallBtn) { voiceCallBtn.disabled = false; voiceCallBtn.style.opacity = '1'; voiceCallBtn.style.cursor = 'pointer'; }
        const p = document.getElementById('authRequiredPrompt'); if (p) p.remove();
    } else {
        if (liveChatBtn) { liveChatBtn.disabled = true; liveChatBtn.style.opacity = '0.6'; liveChatBtn.style.cursor = 'not-allowed'; }
        if (voiceCallBtn) { voiceCallBtn.disabled = true; voiceCallBtn.style.opacity = '0.6'; voiceCallBtn.style.cursor = 'not-allowed'; }
        if (contactSection && !document.getElementById('authRequiredPrompt')) {
            const d = document.createElement('div'); d.id = 'authRequiredPrompt';
            d.style.cssText = 'background:#fff3cd;border:2px solid #ffc107;border-radius:10px;padding:15px 20px;margin-top:15px;text-align:center;';
            d.innerHTML = '<strong style="color:#e65100;">Authentication Required</strong><p style="margin:8px 0;color:#666;">Please log in to access Live Chat and Voice Call.</p><button id="loginPromptBtn" style="background:#1a73e8;color:white;border:none;padding:10px 25px;border-radius:25px;cursor:pointer;">Login Here</button>';
            contactSection.appendChild(d);
            document.getElementById('loginPromptBtn').addEventListener('click', showLoginModal);
        }
    }
}

async function loadStudentDataFromSchool(user) {
    try {
        const uSnap = await usersRef.child(user.uid).once('value');
        const uData = uSnap.val();
        const aSnap = await applicationsRef.orderByChild('userId').equalTo(user.uid).once('value');
        let aData = null;
        if (aSnap.exists()) aSnap.forEach(s => { aData = s.val(); });
        studentInfo = {
            userId: user.uid, userName: uData?.name || aData?.fullName || user.email?.split('@')[0] || 'Student',
            userEmail: user.email || '', applicationStatus: aData?.status || 'unknown',
            educationLevel: aData?.educationLevel || '', yearLevel: aData?.yearLevel || '',
            strandCourse: aData?.strandCourse || '', isEnrolled: aData?.status === 'approved'
        };
        sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        updateAuthUI(); displayUserInfo();
    } catch (e) { console.error(e); }
}

function displayUserInfo() {
    const ui = document.getElementById('userInfo');
    if (!ui) return;
    if (isAuthenticated && studentInfo) {
        const initial = (studentInfo.userName || 'S').charAt(0).toUpperCase();
        ui.innerHTML = '<div class="user-avatar">' + initial + '</div><div><strong>' + studentInfo.userName + '</strong><br><small>' + studentInfo.userEmail + '</small><br><a href="#" id="logoutLink" style="color:#dc3545;font-size:12px;">Logout</a></div>';
        document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); handleLogout(); });
    } else {
        ui.innerHTML = '<div class="user-avatar" style="background:#dc3545;cursor:pointer;" id="loginAvatarBtn"><i class="fas fa-user-lock"></i></div><div><strong style="color:#dc3545;">Not Logged In</strong><br><a href="#" id="loginLink" style="color:#1a73e8;font-size:13px;">Sign In</a></div>';
        document.getElementById('loginLink').addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
        document.getElementById('loginAvatarBtn').addEventListener('click', showLoginModal);
    }
}

function loadSupportTypes() { supportTypesRef.on('value', (s) => {}); }

function loadCategories() {
    categoriesRef.on('value', (snapshot) => {
        allCategories = [];
        const cats = snapshot.val() || {};
        Object.entries(cats).forEach(([k, v]) => { allCategories.push({ id: k, ...v }); });
        categoriesLoaded = true; renderCategories();
    });
}

function renderCategories() {
    const cl = document.getElementById('categoryList');
    if (!cl) return;
    const counts = {};
    allTopics.forEach(t => { const c = t.category || 'Uncategorized'; counts[c] = (counts[c] || 0) + 1; });
    const ca = document.getElementById('countAll'); if (ca) ca.textContent = allTopics.length;
    let h = '<li class="category-item ' + (selectedCategory === 'all' ? 'active' : '') + '" data-category="all"><i class="fas fa-list"></i> All Topics<span class="category-count">' + allTopics.length + '</span></li>';
    allCategories.forEach(cat => { h += '<li class="category-item" data-category="' + cat.name + '"><i class="fas fa-folder"></i> ' + cat.name + '</li>'; });
    cl.innerHTML = h;
    cl.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedCategory = item.dataset.category;
            cl.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active'); filterAndRenderTopics();
        });
    });
}

function loadTopics() {
    topicsRef.once('value', (snapshot) => {
        allTopics = [];
        const topics = snapshot.val() || {};
        Object.entries(topics).forEach(([k, v]) => { allTopics.push({ id: k, ...v }); });
        topicsLoaded = true; renderCategories(); filterAndRenderTopics();
    });
    topicsRef.on('value', (snapshot) => {
        if (!topicsLoaded) return;
        allTopics = [];
        const topics = snapshot.val() || {};
        Object.entries(topics).forEach(([k, v]) => { allTopics.push({ id: k, ...v }); });
        renderCategories(); if (!currentTopicView) filterAndRenderTopics();
    });
}

function filterAndRenderTopics() {
    if (currentTopicView) return;
    const st = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    let filtered = [...allTopics];
    if (selectedCategory !== 'all') filtered = filtered.filter(t => (t.category || 'Uncategorized') === selectedCategory);
    if (st) filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(st));
    if (sortOrder === 'newest') filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderTopics(filtered);
}

function renderTopics(topics) {
    const tg = document.getElementById('topicsGrid');
    const nt = document.getElementById('noTopics');
    if (!tg || currentTopicView) return;
    if (!topicsLoaded) { tg.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading topics...</p></div>'; return; }
    if (topics.length === 0) { tg.innerHTML = ''; if (nt) nt.style.display = 'block'; return; }
    if (nt) nt.style.display = 'none';
    let h = '';
    topics.forEach(topic => {
        const cd = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
        h += '<div class="topic-card" onclick="openTopicDetail(\'' + topic.id + '\')" style="cursor:pointer;"><div class="topic-card-header"><div class="topic-title">' + (topic.title || 'Untitled') + '</div></div><div class="topic-description">' + (topic.description || 'No description') + '</div><div class="topic-meta"><span><i class="fas fa-calendar"></i>' + cd + '</span></div></div>';
    });
    tg.innerHTML = h;
}

function openTopicDetail(topicId) { window.location.hash = 'topic/' + topicId; }

async function incrementViewCount(topicId) {
    try { const ref = topicsRef.child(topicId); const snap = await ref.once('value'); const t = snap.val(); if (t) await ref.update({ views: (t.views || 0) + 1 }); } catch (e) {}
}

function setupEventListeners() {
    document.getElementById('searchInput')?.addEventListener('input', debounce(() => filterAndRenderTopics(), 300));
    document.getElementById('sortBtn')?.addEventListener('click', () => {
        const orders = ['newest', 'oldest', 'popular', 'az'];
        sortOrder = orders[(orders.indexOf(sortOrder) + 1) % orders.length];
        filterAndRenderTopics();
    });
    document.getElementById('liveChatBtn')?.addEventListener('click', openLiveChat);
    document.getElementById('chatClose')?.addEventListener('click', closeLiveChat);
    document.getElementById('chatSendBtn')?.addEventListener('click', sendChatMessage);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    document.getElementById('voiceCallBtn')?.addEventListener('click', openVoiceCall);
    document.getElementById('endCallBtn')?.addEventListener('click', endVoiceCall);
    document.getElementById('muteBtn')?.addEventListener('click', toggleMute);
}

function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }

function monitorCSRStatus() {
    csrStatusRef.on('value', (snapshot) => {
        const status = snapshot.val() || {};
        const qs = document.getElementById('queueStatus');
        if (!qs) return;
        const online = Object.values(status).filter(c => c.status === 'online').length;
        qs.innerHTML = online > 0 ? '<i class="fas fa-circle" style="color:#2e7d32;"></i><span>' + online + ' CSR Available</span>' : '<i class="fas fa-circle" style="color:#e65100;"></i><span>No CSRs Available</span>';
    });
}

function openLiveChat() {
    if (!isAuthenticated || !studentInfo) { showLoginModal(); return; }
    const modal = document.getElementById('chatModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('chatMessages').innerHTML = '<div style="text-align:center;color:#999;padding:20px;">Connecting to support...</div>';
    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').disabled = true;
    document.getElementById('chatSendBtn').disabled = true;
    document.getElementById('queueInfo').innerHTML = '<i class="fas fa-clock"></i> Connecting...';
    const chatRequest = {
        studentId: studentInfo.userId, studentName: studentInfo.userName, studentEmail: studentInfo.userEmail,
        status: 'waiting', createdAt: firebase.database.ServerValue.TIMESTAMP, messages: []
    };
    const newChatRef = chatQueueRef.push();
    currentChatId = newChatRef.key;
    newChatRef.set(chatRequest);
    listenForCSRAssignment(currentChatId);
}

function listenForCSRAssignment(chatId) {
    const chatRef = chatQueueRef.child(chatId);
    if (chatListener) chatRef.off('value', chatListener);
    chatListener = chatRef.on('value', (snapshot) => {
        const chat = snapshot.val();
        if (!chat) return;
        const qi = document.getElementById('queueInfo');
        if (chat.status === 'connected') {
            if (qi) { qi.innerHTML = '<i class="fas fa-check-circle"></i> Connected with ' + (chat.csrName || 'Support Agent'); qi.className = 'queue-info connected'; }
            document.getElementById('chatInput').disabled = false; document.getElementById('chatSendBtn').disabled = false;
            document.getElementById('chatInput').focus();
        } else if (chat.status === 'waiting') { if (qi) qi.innerHTML = '<i class="fas fa-clock"></i> Waiting in queue...'; }
        else if (chat.status === 'ended') { if (qi) qi.innerHTML = 'Chat ended'; document.getElementById('chatInput').disabled = true; document.getElementById('chatSendBtn').disabled = true; }
        if (chat.messages) renderChatMessages(chat.messages);
    });
}

function renderChatMessages(messages) {
    const cm = document.getElementById('chatMessages');
    if (!cm) return;
    let messageArray = [];
    if (Array.isArray(messages)) messageArray = messages;
    else if (messages && typeof messages === 'object') messageArray = Object.values(messages);
    if (messageArray.length === 0) { cm.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">No messages yet.</div>'; return; }
    let h = '';
    messageArray.forEach(msg => {
        if (!msg || !msg.text) return;
        const cls = (msg.sender === 'student') ? 'user' : 'support';
        h += '<div class="message ' + cls + '"><div class="message-bubble">' + msg.text + '</div></div>';
    });
    cm.innerHTML = h; cm.scrollTop = cm.scrollHeight;
}

function sendChatMessage() {
    const text = document.getElementById('chatInput')?.value?.trim();
    if (!text || !currentChatId) return;
    chatQueueRef.child(currentChatId).child('messages').push({ sender: 'student', text, timestamp: firebase.database.ServerValue.TIMESTAMP });
    document.getElementById('chatInput').value = '';
}

function closeLiveChat() {
    document.getElementById('chatModal')?.classList.remove('active');
    if (currentChatId) { chatQueueRef.child(currentChatId).update({ status: 'ended' }); currentChatId = null; }
}

async function openVoiceCall() {
    if (!isAuthenticated || !studentInfo) { showLoginModal(); return; }
    const modal = document.getElementById('callModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('callStatus').textContent = 'Requesting microphone...';
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('callStatus').textContent = 'Connecting...';
        const callRequest = { studentId: studentInfo.userId, studentName: studentInfo.userName, studentEmail: studentInfo.userEmail, status: 'waiting', createdAt: firebase.database.ServerValue.TIMESTAMP };
        const newCallRef = callQueueRef.push();
        currentCallId = newCallRef.key;
        await newCallRef.set(callRequest);
        listenForCallConnection(currentCallId);
    } catch (error) { showToast('Microphone access denied', 'error'); endVoiceCall(); }
}

function listenForCallConnection(callId) {
    const callRef = callQueueRef.child(callId);
    if (callListener) callRef.off('value', callListener);
    callListener = callRef.on('value', (snapshot) => {
        const call = snapshot.val();
        if (!call) return;
        if (call.status === 'connected') {
            document.getElementById('callStatus').textContent = 'Connected with ' + (call.csrName || 'Agent');
            startCallTimer();
            startAudioPlayback(callId);
        } else if (call.status === 'ended') { endVoiceCall(); }
    });
}

function startAudioPlayback(callId) {
    if (audioStreamListener) {
        callQueueRef.child(callId).child('audioStream').off('child_added', audioStreamListener);
    }
    audioStreamListener = callQueueRef.child(callId).child('audioStream').on('child_added', (snapshot) => {
        const audioData = snapshot.val();
        if (audioData && audioData.data) {
            playBase64Audio(audioData.data);
        }
    });
}

function playBase64Audio(base64Data) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        }
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768.0;
        }
        const buffer = audioContext.createBuffer(1, float32.length, 16000);
        buffer.getChannelData(0).set(float32);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
    } catch (e) {
        console.error('Audio playback error:', e);
    }
}

function startCallTimer() { callStartTime = Date.now(); updateCallTimer(); callTimerInterval = setInterval(updateCallTimer, 1000); }
function updateCallTimer() { const timer = document.getElementById('callTimer'); if (timer && callStartTime) { const e = Math.floor((Date.now() - callStartTime) / 1000); timer.textContent = String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0'); } }

function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const mb = document.getElementById('muteBtn');
    if (mb) mb.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
}

function endVoiceCall() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (audioStreamListener && currentCallId) {
        callQueueRef.child(currentCallId).child('audioStream').off('child_added', audioStreamListener);
        audioStreamListener = null;
    }
    if (currentCallId) { callQueueRef.child(currentCallId).update({ status: 'ended' }); currentCallId = null; }
    document.getElementById('callModal')?.classList.remove('active');
    callStartTime = null;
    const t = document.getElementById('callTimer'); if (t) t.textContent = '00:00';
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type; toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

window.addEventListener('beforeunload', () => {
    if (currentChatId) chatQueueRef.child(currentChatId).update({ status: 'ended' });
    if (currentCallId) callQueueRef.child(currentCallId).update({ status: 'ended' });
    endVoiceCall();
});
