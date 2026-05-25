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
    
    supportDatabase.ref('helpTopics').once('value')
        .then((snapshot) => {
            console.log('📚 helpTopics exists:', snapshot.exists(), 'count:', snapshot.numChildren());
        })
        .catch((error) => {
            console.error('❌ Error reading helpTopics:', error);
        });
    
    supportDatabase.ref('helpCategories').once('value')
        .then((snapshot) => {
            console.log('📁 helpCategories exists:', snapshot.exists(), 'count:', snapshot.numChildren());
        })
        .catch((error) => {
            console.error('❌ Error reading helpCategories:', error);
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
    if (!topic) {
        window.location.hash = '';
        return;
    }
    
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
        if (topicsHeader && topicsHeader.parentNode) {
            topicsHeader.parentNode.insertBefore(backNav, topicsHeader);
        }
    }
    
    backNav.innerHTML = '<button id="backToTopicsBtn" style="background:#f0f0f0;border:none;padding:10px 20px;border-radius:25px;cursor:pointer;font-size:14px;font-weight:600;color:#333;"><i class="fas fa-arrow-left"></i> Back to Topics</button>';
    backNav.style.display = 'block';
    
    document.getElementById('backToTopicsBtn').addEventListener('click', () => {
        window.location.hash = '';
        hideTopicDetail();
    });
    
    if (searchBar) searchBar.style.display = 'none';
    if (sortBtn) sortBtn.style.display = 'none';
    if (noTopics) noTopics.style.display = 'none';
    
    if (topicsTitle) {
        topicsTitle.innerHTML = '<i class="fas fa-file-alt" style="color:var(--primary);"></i> ' + (topic.title || 'Untitled');
    }
    
    const createdDate = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown';
    const updatedDate = topic.updatedAt && topic.updatedAt !== topic.createdAt ? new Date(topic.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    const tagsHtml = (topic.tags || []).map(tag => '<span style="background:#e9ecef;padding:4px 12px;border-radius:15px;font-size:13px;margin-right:5px;">#' + tag + '</span>').join('');
    
    topicsGrid.innerHTML = '<div style="background:white;border-radius:12px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,0.05);"><div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #eee;"><div style="display:flex;align-items:center;gap:15px;margin-bottom:10px;flex-wrap:wrap;"><span style="background:#e3f2fd;color:#1a73e8;padding:5px 15px;border-radius:20px;font-size:13px;font-weight:600;"><i class="fas fa-folder"></i> ' + (topic.category || 'Uncategorized') + '</span><span style="color:#666;font-size:13px;"><i class="fas fa-eye"></i> ' + (topic.views || 0) + ' views</span><span style="color:#666;font-size:13px;"><i class="fas fa-calendar"></i> Published: ' + createdDate + '</span>' + (updatedDate ? '<span style="color:#666;font-size:13px;"><i class="fas fa-edit"></i> Updated: ' + updatedDate + '</span>' : '') + '</div>' + (tagsHtml ? '<div style="margin-top:10px;">' + tagsHtml + '</div>' : '') + '</div><div style="margin-bottom:25px;"><h3 style="color:#555;margin-bottom:10px;">Description</h3><p style="color:#666;font-size:15px;line-height:1.8;">' + (topic.description || 'No description available.') + '</p></div><div style="background:#f8f9fa;padding:25px;border-radius:10px;border-left:4px solid #1a73e8;"><h3 style="color:#333;margin-bottom:15px;">Detailed Content</h3><div style="color:#444;font-size:15px;line-height:1.9;">' + (topic.content || 'No detailed content available.') + '</div></div><div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;text-align:center;"><p style="color:#999;margin-bottom:15px;">Was this article helpful?</p><button onclick="incrementViewCount(\'' + topic.id + '\');showToast(\'Thank you!\',\'success\');" style="background:#28a745;color:white;border:none;padding:10px 25px;border-radius:25px;cursor:pointer;font-size:14px;margin:0 5px;"><i class="fas fa-thumbs-up"></i> Yes</button><button onclick="showToast(\'We will improve this article.\',\'info\');" style="background:#dc3545;color:white;border:none;padding:10px 25px;border-radius:25px;cursor:pointer;font-size:14px;margin:0 5px;"><i class="fas fa-thumbs-down"></i> No</button></div></div>';
    
    incrementViewCount(topicId);
}

function hideTopicDetail() {
    currentTopicView = null;
    const searchBar = document.querySelector('.search-bar');
    const sortBtn = document.getElementById('sortBtn');
    const backNav = document.getElementById('topicBackNav');
    const topicsTitle = document.getElementById('topicsTitle');
    if (searchBar) searchBar.style.display = '';
    if (sortBtn) sortBtn.style.display = '';
    if (backNav) backNav.style.display = 'none';
    if (topicsTitle) topicsTitle.textContent = selectedCategory === 'all' ? 'All Help Topics' : selectedCategory + ' Topics';
    filterAndRenderTopics();
}

function showLoginModal() {
    const existingModal = document.getElementById('loginModalOverlay');
    if (existingModal) existingModal.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;';
    overlay.innerHTML = '<div style="background:white;border-radius:15px;padding:30px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);"><div style="text-align:center;margin-bottom:20px;"><div style="width:60px;height:60px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 15px;"><i class="fas fa-user-graduate" style="font-size:28px;color:white;"></i></div><h3 style="margin:0;color:#333;">School Portal Login</h3></div><div id="loginError" style="display:none;background:#f8d7da;color:#721c24;padding:10px;border-radius:8px;margin-bottom:15px;font-size:13px;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;color:#555;font-weight:600;font-size:13px;">Email</label><input type="email" id="loginEmailInput" style="width:100%;padding:12px 15px;border:2px solid #dee2e6;border-radius:10px;font-size:14px;box-sizing:border-box;"></div><div style="margin-bottom:20px;"><label style="display:block;margin-bottom:5px;color:#555;font-weight:600;font-size:13px;">Password</label><div style="position:relative;"><input type="password" id="loginPasswordInput" style="width:100%;padding:12px 45px 12px 15px;border:2px solid #dee2e6;border-radius:10px;font-size:14px;box-sizing:border-box;"><button type="button" id="togglePasswordBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#999;cursor:pointer;font-size:16px;padding:5px;"><i class="fas fa-eye"></i></button></div></div><button id="loginSubmitBtn" style="width:100%;padding:12px;background:#1a73e8;color:white;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px;">Sign In</button><button id="loginCancelBtn" style="width:100%;padding:10px;background:transparent;color:#666;border:1px solid #dee2e6;border-radius:10px;cursor:pointer;">Cancel</button><p style="text-align:center;margin-top:15px;font-size:12px;">Dont have an account? <a href="#" id="switchToRegisterLink" style="color:#1a73e8;">Register here</a></p></div>';
    document.body.appendChild(overlay);
    
    document.getElementById('togglePasswordBtn').addEventListener('click', () => {
        const pwd = document.getElementById('loginPasswordInput');
        const icon = document.querySelector('#togglePasswordBtn i');
        if (pwd.type === 'password') { pwd.type = 'text'; icon.className = 'fas fa-eye-slash'; }
        else { pwd.type = 'password'; icon.className = 'fas fa-eye'; }
    });
    
    document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmailInput').value.trim();
        const password = document.getElementById('loginPasswordInput').value;
        const errorDiv = document.getElementById('loginError');
        if (!email || !password) { errorDiv.style.display = 'block'; errorDiv.textContent = 'Please enter both email and password.'; return; }
        const btn = document.getElementById('loginSubmitBtn');
        btn.disabled = true; btn.innerHTML = 'Signing in...';
        try {
            await schoolAuth.signInWithEmailAndPassword(email, password);
            overlay.remove();
            showToast('Login successful!', 'success');
        } catch (error) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = error.code === 'auth/user-not-found' ? 'No account found.' : error.code === 'auth/wrong-password' ? 'Incorrect password.' : 'Login failed.';
        } finally { btn.disabled = false; btn.innerHTML = 'Sign In'; }
    });
    
    document.getElementById('loginCancelBtn').addEventListener('click', () => overlay.remove());
    document.getElementById('switchToRegisterLink').addEventListener('click', (e) => { e.preventDefault(); overlay.remove(); showRegisterModal(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('loginPasswordInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('loginSubmitBtn').click(); });
    setTimeout(() => document.getElementById('loginEmailInput').focus(), 100);
}

function showRegisterModal() {
    const existingModal = document.getElementById('loginModalOverlay');
    if (existingModal) existingModal.remove();
    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;';
    overlay.innerHTML = '<div style="background:white;border-radius:15px;padding:30px;max-width:400px;width:90%;"><div style="text-align:center;margin-bottom:20px;"><div style="width:60px;height:60px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 15px;"><i class="fas fa-user-plus" style="font-size:28px;color:white;"></i></div><h3 style="margin:0;color:#333;">Create Account</h3></div><div id="registerError" style="display:none;background:#f8d7da;color:#721c24;padding:10px;border-radius:8px;margin-bottom:15px;font-size:13px;"></div><div id="registerSuccess" style="display:none;background:#d4edda;color:#155724;padding:10px;border-radius:8px;margin-bottom:15px;font-size:13px;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;color:#555;font-weight:600;">Full Name</label><input type="text" id="registerNameInput" style="width:100%;padding:12px 15px;border:2px solid #dee2e6;border-radius:10px;font-size:14px;box-sizing:border-box;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;color:#555;font-weight:600;">Email</label><input type="email" id="registerEmailInput" style="width:100%;padding:12px 15px;border:2px solid #dee2e6;border-radius:10px;font-size:14px;box-sizing:border-box;"></div><div style="margin-bottom:15px;"><label style="display:block;margin-bottom:5px;color:#555;font-weight:600;">Password</label><input type="password" id="registerPasswordInput" style="width:100%;padding:12px 15px;border:2px solid #dee2e6;border-radius:10px;font-size:14px;box-sizing:border-box;"></div><div style="margin-bottom:20px;"><label style="display:block;margin-bottom:5px;color:#555;font-weight:600;">Confirm Password</label><input type="password" id="registerConfirmPasswordInput" style="width:100%;padding:12px 15px;border:2px solid #dee2e6;border-radius:10px;font-size:14px;box-sizing:border-box;"></div><button id="registerSubmitBtn" style="width:100%;padding:12px;background:#28a745;color:white;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px;">Create Account</button><button id="registerCancelBtn" style="width:100%;padding:10px;background:transparent;color:#666;border:1px solid #dee2e6;border-radius:10px;cursor:pointer;">Cancel</button><p style="text-align:center;margin-top:15px;font-size:12px;">Already have an account? <a href="#" id="switchToLoginLink" style="color:#1a73e8;">Sign in</a></p></div>';
    document.body.appendChild(overlay);
    
    document.getElementById('registerSubmitBtn').addEventListener('click', async () => {
        const name = document.getElementById('registerNameInput').value.trim();
        const email = document.getElementById('registerEmailInput').value.trim();
        const password = document.getElementById('registerPasswordInput').value;
        const confirm = document.getElementById('registerConfirmPasswordInput').value;
        const errDiv = document.getElementById('registerError');
        const sucDiv = document.getElementById('registerSuccess');
        errDiv.style.display = 'none'; sucDiv.style.display = 'none';
        if (!name || !email || !password || !confirm) { errDiv.style.display = 'block'; errDiv.textContent = 'Please fill all fields.'; return; }
        if (password.length < 6) { errDiv.style.display = 'block'; errDiv.textContent = 'Password must be 6+ characters.'; return; }
        if (password !== confirm) { errDiv.style.display = 'block'; errDiv.textContent = 'Passwords do not match.'; return; }
        const btn = document.getElementById('registerSubmitBtn');
        btn.disabled = true; btn.innerHTML = 'Creating...';
        try {
            const cred = await schoolAuth.createUserWithEmailAndPassword(email, password);
            await usersRef.child(cred.user.uid).set({ name, email, createdAt: Date.now() });
            sucDiv.style.display = 'block'; sucDiv.textContent = 'Account created! Redirecting...';
            setTimeout(() => { overlay.remove(); showLoginModal(); }, 1500);
        } catch (error) {
            errDiv.style.display = 'block';
            errDiv.textContent = error.code === 'auth/email-already-in-use' ? 'Email already registered.' : 'Registration failed.';
        } finally { btn.disabled = false; btn.innerHTML = 'Create Account'; }
    });
    
    document.getElementById('registerCancelBtn').addEventListener('click', () => overlay.remove());
    document.getElementById('switchToLoginLink').addEventListener('click', (e) => { e.preventDefault(); overlay.remove(); showLoginModal(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function handleLogout() {
    schoolAuth.signOut().then(() => {
        sessionStorage.removeItem('studentInfo');
        currentSchoolUser = null; isAuthenticated = false; studentInfo = null;
        updateAuthUI(); displayUserInfo();
        showToast('Logged out', 'info');
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
            const d = document.createElement('div');
            d.id = 'authRequiredPrompt';
            d.style.cssText = 'background:#fff3cd;border:2px solid #ffc107;border-radius:10px;padding:15px 20px;margin-top:15px;text-align:center;';
            d.innerHTML = '<i class="fas fa-lock" style="font-size:20px;color:#e65100;margin-bottom:8px;display:block;"></i><strong style="color:#e65100;">Authentication Required</strong><p style="margin:8px 0;color:#666;">Please log in to access Live Chat and Voice Call.</p><button id="loginPromptBtn" style="background:#1a73e8;color:white;border:none;padding:10px 25px;border-radius:25px;font-size:14px;font-weight:600;cursor:pointer;">Login Here</button>';
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
            userId: user.uid,
            userName: uData?.name || aData?.fullName || user.email?.split('@')[0] || 'Student',
            userEmail: user.email || '',
            applicationStatus: aData?.status || 'unknown',
            educationLevel: aData?.educationLevel || '',
            yearLevel: aData?.yearLevel || '',
            strandCourse: aData?.strandCourse || '',
            isEnrolled: aData?.status === 'approved'
        };
        sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        updateAuthUI(); displayUserInfo();
    } catch (e) { console.error(e); studentInfo = null; isAuthenticated = false; updateAuthUI(); displayUserInfo(); }
}

function displayUserInfo() {
    const ui = document.getElementById('userInfo');
    if (!ui) return;
    if (isAuthenticated && studentInfo) {
        const initial = (studentInfo.userName || 'S').charAt(0).toUpperCase();
        const badge = studentInfo.isEnrolled ? '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">Enrolled</span>' : '<span style="background:#ffc107;color:#333;padding:2px 8px;border-radius:10px;font-size:11px;">Applicant</span>';
        ui.innerHTML = '<div class="user-avatar">' + initial + '</div><div><strong>' + studentInfo.userName + '</strong> ' + badge + '<br><small>' + studentInfo.userEmail + '</small><br><a href="#" id="logoutLink" style="color:#dc3545;font-size:12px;text-decoration:none;"><i class="fas fa-sign-out-alt"></i> Logout</a></div>';
        document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); handleLogout(); });
    } else {
        ui.innerHTML = '<div class="user-avatar" style="background:#dc3545;cursor:pointer;" id="loginAvatarBtn"><i class="fas fa-user-lock"></i></div><div><strong style="color:#dc3545;">Not Logged In</strong><br><a href="#" id="loginLink" style="color:#1a73e8;font-size:13px;">Sign In</a></div>';
        document.getElementById('loginLink').addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
        document.getElementById('loginAvatarBtn').addEventListener('click', showLoginModal);
    }
}

function loadSupportTypes() { supportTypesRef.on('value', (s) => { console.log('Support types:', s.val()); }); }

function loadCategories() {
    categoriesRef.on('value', (snapshot) => {
        allCategories = [];
        const cats = snapshot.val() || {};
        Object.entries(cats).forEach(([k, v]) => { allCategories.push({ id: k, ...v }); });
        categoriesLoaded = true;
        renderCategories();
    });
}

function renderCategories() {
    const cl = document.getElementById('categoryList');
    if (!cl) return;
    const counts = {};
    allTopics.forEach(t => { const c = t.category || 'Uncategorized'; counts[c] = (counts[c] || 0) + 1; });
    const ca = document.getElementById('countAll'); if (ca) ca.textContent = allTopics.length;
    let h = '<li class="category-item ' + (selectedCategory === 'all' ? 'active' : '') + '" data-category="all"><i class="fas fa-list"></i> All Topics<span class="category-count">' + allTopics.length + '</span></li>';
    allCategories.forEach(cat => { const cnt = counts[cat.name] || 0; h += '<li class="category-item ' + (selectedCategory === cat.name ? 'active' : '') + '" data-category="' + cat.name + '"><i class="fas ' + (cat.icon || 'fa-folder') + '"></i> ' + cat.name + '<span class="category-count">' + cnt + '</span></li>'; });
    cl.innerHTML = h;
    cl.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedCategory = item.dataset.category;
            cl.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            filterAndRenderTopics();
        });
    });
}

function loadTopics() {
    topicsRef.once('value', (snapshot) => {
        allTopics = [];
        const topics = snapshot.val() || {};
        Object.entries(topics).forEach(([k, v]) => { allTopics.push({ id: k, ...v }); });
        topicsLoaded = true;
        console.log('Topics loaded. Count:', allTopics.length);
        renderCategories();
        filterAndRenderTopics();
    }).catch((error) => {
        console.error('Error loading topics:', error);
        topicsLoaded = true;
        const tg = document.getElementById('topicsGrid');
        if (tg) tg.innerHTML = '<div style="text-align:center;padding:40px;"><i class="fas fa-exclamation-triangle" style="font-size:40px;color:#dc3545;"></i><p>Failed to load topics.</p><button onclick="location.reload()" style="padding:10px 20px;background:#1a73e8;color:white;border:none;border-radius:25px;cursor:pointer;">Refresh</button></div>';
    });
    
    topicsRef.on('value', (snapshot) => {
        if (!topicsLoaded) return;
        allTopics = [];
        const topics = snapshot.val() || {};
        Object.entries(topics).forEach(([k, v]) => { allTopics.push({ id: k, ...v }); });
        renderCategories();
        if (!currentTopicView) filterAndRenderTopics();
    });
}

function filterAndRenderTopics() {
    if (currentTopicView) return;
    const st = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    let filtered = [...allTopics];
    if (selectedCategory !== 'all') filtered = filtered.filter(t => (t.category || 'Uncategorized') === selectedCategory);
    if (st) filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(st) || (t.description || '').toLowerCase().includes(st));
    if (sortOrder === 'newest') filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (sortOrder === 'popular') filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sortOrder === 'az') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    renderTopics(filtered);
}

function renderTopics(topics) {
    const tg = document.getElementById('topicsGrid');
    const nt = document.getElementById('noTopics');
    const tt = document.getElementById('topicsTitle');
    if (!tg || currentTopicView) return;
    if (!topicsLoaded) { tg.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading topics...</p></div>'; return; }
    if (topics.length === 0) { tg.innerHTML = ''; if (nt) nt.style.display = 'block'; if (tt) tt.textContent = allTopics.length === 0 ? 'No Topics Available Yet' : 'No Topics Found'; return; }
    if (nt) nt.style.display = 'none';
    if (tt) tt.textContent = selectedCategory === 'all' ? 'All Help Topics' : selectedCategory + ' Topics';
    let h = '';
    topics.forEach(topic => {
        const cd = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
        const isNew = topic.createdAt && (Date.now() - topic.createdAt) < 604800000;
        let badge = isNew ? '<span class="topic-badge badge-new">NEW</span>' : ((topic.views || 0) > 100 ? '<span class="topic-badge badge-popular">POPULAR</span>' : '');
        const tagsH = (topic.tags || []).map(tag => '<span style="background:#e9ecef;padding:2px 8px;border-radius:10px;font-size:12px;">#' + tag + '</span>').join(' ');
        h += '<div class="topic-card" onclick="openTopicDetail(\'' + topic.id + '\')" style="cursor:pointer;"><div class="topic-card-header"><div class="topic-title"><i class="fas fa-file-alt" style="color:var(--primary);"></i>' + (topic.title || 'Untitled') + badge + '</div></div><div class="topic-description">' + (topic.description || 'No description') + '</div><div class="topic-meta"><span><i class="fas fa-eye"></i>' + (topic.views || 0) + ' views</span><span><i class="fas fa-calendar"></i>' + cd + '</span><span><i class="fas fa-folder"></i>' + (topic.category || 'Uncategorized') + '</span></div>' + (tagsH ? '<div style="margin-top:10px;">' + tagsH + '</div>' : '') + '</div>';
    });
    tg.innerHTML = h;
}

function openTopicDetail(topicId) { window.location.hash = 'topic/' + topicId; }
window.toggleTopic = function(card, topicId) { openTopicDetail(topicId); };

async function incrementViewCount(topicId) {
    try {
        const ref = topicsRef.child(topicId);
        const snap = await ref.once('value');
        const t = snap.val();
        if (t) await ref.update({ views: (t.views || 0) + 1 });
    } catch (e) {}
}

function setupEventListeners() {
    document.getElementById('searchInput')?.addEventListener('input', debounce(() => filterAndRenderTopics(), 300));
    document.getElementById('sortBtn')?.addEventListener('click', () => {
        const orders = ['newest', 'oldest', 'popular', 'az'];
        sortOrder = orders[(orders.indexOf(sortOrder) + 1) % orders.length];
        document.getElementById('sortBtn').innerHTML = '<i class="fas fa-sort-amount-down"></i> ' + sortOrder.charAt(0).toUpperCase() + sortOrder.slice(1) + ' First';
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
        qs.className = 'queue-status' + (online === 0 ? ' busy' : '');
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
    document.getElementById('queueInfo').className = 'queue-info';
    
    const chatRequest = {
        studentId: studentInfo.userId,
        studentName: studentInfo.userName,
        studentEmail: studentInfo.userEmail,
        educationLevel: studentInfo.educationLevel || '',
        yearLevel: studentInfo.yearLevel || '',
        course: studentInfo.strandCourse || '',
        applicationStatus: studentInfo.applicationStatus || '',
        isEnrolled: studentInfo.isEnrolled || false,
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        messages: []
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
        console.log('Chat update:', chat.status);
        
        const qi = document.getElementById('queueInfo');
        if (chat.status === 'connected') {
            if (qi) { qi.innerHTML = '<i class="fas fa-check-circle"></i> Connected with ' + (chat.csrName || 'Support Agent'); qi.className = 'queue-info connected'; }
            document.getElementById('chatInput').disabled = false;
            document.getElementById('chatSendBtn').disabled = false;
            document.getElementById('chatInput').focus();
        } else if (chat.status === 'waiting') {
            if (qi) { qi.innerHTML = '<i class="fas fa-clock"></i> Waiting in queue...'; }
        } else if (chat.status === 'ended') {
            if (qi) { qi.innerHTML = '<i class="fas fa-check-circle"></i> Chat ended'; }
            document.getElementById('chatInput').disabled = true;
            document.getElementById('chatSendBtn').disabled = true;
        }
        if (chat.messages) renderChatMessages(chat.messages);
    });
}

function renderChatMessages(messages) {
    const cm = document.getElementById('chatMessages');
    if (!cm) return;
    
    let messageArray = [];
    if (Array.isArray(messages)) {
        messageArray = messages;
    } else if (messages && typeof messages === 'object') {
        messageArray = Object.values(messages);
    }
    
    if (messageArray.length === 0) {
        cm.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">No messages yet. Start the conversation!</div>';
        return;
    }
    
    let h = '';
    messageArray.forEach(msg => {
        if (!msg || !msg.text) return;
        const senderInitial = (msg.sender === 'student') ? (studentInfo?.userName || 'S').charAt(0).toUpperCase() : 'C';
        const msgClass = (msg.sender === 'student') ? 'user' : 'support';
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
        
        h += '<div class="message ' + msgClass + '">';
        h += '<div class="message-avatar">' + senderInitial + '</div>';
        h += '<div>';
        h += '<div class="message-bubble">' + msg.text + '</div>';
        h += '<div class="message-time">' + timeStr + '</div>';
        h += '</div></div>';
    });
    cm.innerHTML = h;
    cm.scrollTop = cm.scrollHeight;
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
    if (chatListener) { chatQueueRef.off('value', chatListener); chatListener = null; }
}

function formatTime(timestamp) { return timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''; }

async function openVoiceCall() {
    if (!isAuthenticated || !studentInfo) { showLoginModal(); return; }
    const modal = document.getElementById('callModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('callStatus').textContent = 'Requesting microphone...';
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        document.getElementById('callStatus').textContent = 'Connecting...';
        const callRequest = {
            studentId: studentInfo.userId,
            studentName: studentInfo.userName,
            studentEmail: studentInfo.userEmail,
            status: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        const newCallRef = callQueueRef.push();
        currentCallId = newCallRef.key;
        await newCallRef.set(callRequest);
        listenForCallConnection(currentCallId);
    } catch (error) { showToast('Microphone access denied', 'error'); endVoiceCall(); }
}

function listenForCallConnection(callId) {
    const callRef = callQueueRef.child(callId);
    if (callListener) callRef.off('value', callListener);
    
    callListener = callRef.on('value', async (snapshot) => {
        const call = snapshot.val();
        if (!call) return;
        console.log('Call update:', call.status);
        if (call.status === 'connected') {
            document.getElementById('callStatus').textContent = 'Connected with ' + (call.csrName || 'Agent');
            startCallTimer();
            await createPeerConnection(callId);
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            await callRef.update({ offer: offer });
        } else if (call.status === 'ended') {
            endVoiceCall();
        } else if (call.status === 'waiting') {
            document.getElementById('callStatus').textContent = 'Waiting for available agent...';
        }
    });
}

async function createPeerConnection(callId) {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    peerConnection = new RTCPeerConnection(configuration);
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            callQueueRef.child(callId).child('iceCandidates').child('student').push({ 
                candidate: event.candidate.toJSON() 
            });
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'failed') {
            endVoiceCall();
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
            endVoiceCall();
        }
    };
    
    peerConnection.ontrack = (event) => {
        console.log('Remote track received');
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(e => console.log('Audio play requires user interaction:', e));
    };
    
    callQueueRef.child(callId).child('answer').on('value', async (snapshot) => {
        const answer = snapshot.val();
        if (answer && peerConnection && peerConnection.signalingState === 'have-local-offer') {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('Remote answer set successfully');
            } catch (e) {
                console.error('Error setting remote answer:', e);
            }
        }
    });
    
    callQueueRef.child(callId).child('iceCandidates').child('csr').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data && data.candidate && peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                .catch(e => console.error('Error adding ICE candidate:', e));
        }
    });
}
function startCallTimer() { callStartTime = Date.now(); updateCallTimer(); callTimerInterval = setInterval(updateCallTimer, 1000); }
function updateCallTimer() { const timer = document.getElementById('callTimer'); if (timer && callStartTime) { const e = Math.floor((Date.now() - callStartTime) / 1000); timer.textContent = String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0'); } }
function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const mb = document.getElementById('muteBtn');
    if (mb) { mb.classList.toggle('active', isMuted); mb.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>'; }
}
function endVoiceCall() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (currentCallId) { callQueueRef.child(currentCallId).update({ status: 'ended' }); if (callListener) callQueueRef.child(currentCallId).off('value', callListener); callListener = null; currentCallId = null; }
    document.getElementById('callModal')?.classList.remove('active');
    callStartTime = null;
    const t = document.getElementById('callTimer'); if (t) t.textContent = '00:00';
    const s = document.getElementById('callStatus'); if (s) s.textContent = 'Call ended';
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
    toast.addEventListener('click', () => toast.remove());
}

window.addEventListener('beforeunload', () => {
    if (currentChatId) chatQueueRef.child(currentChatId).update({ status: 'ended' });
    if (currentCallId) callQueueRef.child(currentCallId).update({ status: 'ended' });
    endVoiceCall();
});
