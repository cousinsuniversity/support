// ==================== FIREBASE CONFIGURATIONS ====================
// School Enrollment System Firebase (for authentication & user data)
const schoolFirebaseConfig = {
  apiKey: "AIzaSyDhE0CtfujSQoTjVTD7uNJXrEFaNyp4hzQ",
  authDomain: "school-enrollment-system-356e2.firebaseapp.com",
  databaseURL: "https://school-enrollment-system-356e2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-enrollment-system-356e2",
  storageBucket: "school-enrollment-system-356e2.firebasestorage.app",
  messagingSenderId: "445983385148",
  appId: "1:445983385148:web:55a608ebb987e2c7c94539"
};

// Help & Support Firebase (for topics, chat, call queues)
// FIXED: Added explicit databaseURL
const supportFirebaseConfig = {
  apiKey: "AIzaSyB-f_fQ3OlB5kDqQsNVsTr5X6fs06AHRGQ",
  authDomain: "class-learn-support.firebaseapp.com",
  databaseURL: "https://class-learn-support-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "class-learn-support",
  storageBucket: "class-learn-support.firebasestorage.app",
  messagingSenderId: "769978864199",
  appId: "1:769978864199:web:998023f57d8486e8a09762"
};

// Initialize both Firebase apps with unique names
const schoolApp = firebase.initializeApp(schoolFirebaseConfig, "schoolApp");
const supportApp = firebase.initializeApp(supportFirebaseConfig, "supportApp");

// School Enrollment Database & Auth (for user accounts)
const schoolDatabase = schoolApp.database();
const schoolAuth = schoolApp.auth();

// Help & Support Database (for topics, chat, calls)
const supportDatabase = supportApp.database();

// References - Support Database
const topicsRef = supportDatabase.ref('helpTopics');
const categoriesRef = supportDatabase.ref('helpCategories');
const chatQueueRef = supportDatabase.ref('chatQueue');
const callQueueRef = supportDatabase.ref('callQueue');
const csrStatusRef = supportDatabase.ref('csrStatus');
const supportTypesRef = supportDatabase.ref('supportTypes');

// References - School Database (for user data)
const studentsRef = schoolDatabase.ref('students');
const usersRef = schoolDatabase.ref('users');
const applicationsRef = schoolDatabase.ref('applications');

// State
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

// WebRTC
let localStream = null;
let peerConnection = null;
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== HELP & SUPPORT INITIALIZING ===');
    console.log('Support Firebase Project:', supportFirebaseConfig.projectId);
    console.log('Support Database URL:', supportFirebaseConfig.databaseURL);
    
    // Test database connection immediately
    testDatabaseConnection();
    
    loadSupportTypes();
    loadCategories();
    loadTopics();
    setupEventListeners();
    monitorCSRStatus();
    updateAuthUI();
    
    // Check URL hash for topic detail view
    checkUrlHash();
    
    // Check for stored session
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
    
    // Listen for auth state changes from school enrollment system
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
    
    // Listen for browser back/forward
    window.addEventListener('hashchange', checkUrlHash);
});

// ==================== DATABASE CONNECTION TEST ====================
function testDatabaseConnection() {
    console.log('Testing database connection...');
    
    // Test writing a small ping value
    supportDatabase.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {
            console.log('✅ Connected to support Firebase successfully!');
        } else {
            console.log('❌ Disconnected from support Firebase');
        }
    });
    
    // Try to read helpTopics directly
    supportDatabase.ref('helpTopics').once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            console.log('📚 helpTopics raw data:', data);
            console.log('📚 helpTopics exists:', snapshot.exists());
            console.log('📚 helpTopics children count:', snapshot.numChildren());
            
            if (!snapshot.exists()) {
                console.warn('⚠️ No helpTopics found in database! Admin needs to add topics.');
            }
        })
        .catch((error) => {
            console.error('❌ Error reading helpTopics:', error);
        });
    
    // Try to read helpCategories directly
    supportDatabase.ref('helpCategories').once('value')
        .then((snapshot) => {
            const data = snapshot.val();
            console.log('📁 helpCategories raw data:', data);
            console.log('📁 helpCategories exists:', snapshot.exists());
            console.log('📁 helpCategories children count:', snapshot.numChildren());
            
            if (!snapshot.exists()) {
                console.warn('⚠️ No helpCategories found in database! Admin needs to add categories.');
            }
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

// ==================== TOPIC DETAIL VIEW ====================
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
    
    backNav.innerHTML = `
        <button id="backToTopicsBtn" style="
            background: #f0f0f0;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            color: #333;
            transition: all 0.3s;
        " onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='#f0f0f0'">
            <i class="fas fa-arrow-left"></i> Back to Topics
        </button>
    `;
    backNav.style.display = 'block';
    
    document.getElementById('backToTopicsBtn').addEventListener('click', () => {
        window.location.hash = '';
        hideTopicDetail();
    });
    
    if (searchBar) searchBar.style.display = 'none';
    if (sortBtn) sortBtn.style.display = 'none';
    if (noTopics) noTopics.style.display = 'none';
    
    if (topicsTitle) {
        topicsTitle.innerHTML = `<i class="fas fa-file-alt" style="color:var(--primary);"></i> ${topic.title || 'Untitled'}`;
    }
    
    const createdDate = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    }) : 'Unknown';
    
    const updatedDate = topic.updatedAt && topic.updatedAt !== topic.createdAt ? 
        new Date(topic.updatedAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        }) : null;
    
    const tagsHtml = (topic.tags || []).map(tag => 
        `<span style="background:#e9ecef; padding:4px 12px; border-radius:15px; font-size:13px; margin-right:5px;">#${tag}</span>`
    ).join('');
    
    topicsGrid.innerHTML = `
        <div style="background:white; border-radius:12px; padding:30px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
            <div style="margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid #eee;">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px; flex-wrap:wrap;">
                    <span style="background:#e3f2fd; color:#1a73e8; padding:5px 15px; border-radius:20px; font-size:13px; font-weight:600;">
                        <i class="fas fa-folder"></i> ${topic.category || 'Uncategorized'}
                    </span>
                    <span style="color:#666; font-size:13px;">
                        <i class="fas fa-eye"></i> ${topic.views || 0} views
                    </span>
                    <span style="color:#666; font-size:13px;">
                        <i class="fas fa-calendar"></i> Published: ${createdDate}
                    </span>
                    ${updatedDate ? `<span style="color:#666; font-size:13px;"><i class="fas fa-edit"></i> Updated: ${updatedDate}</span>` : ''}
                </div>
                ${tagsHtml ? `<div style="margin-top:10px;">${tagsHtml}</div>` : ''}
            </div>
            
            <div style="margin-bottom:25px;">
                <h3 style="color:#555; margin-bottom:10px;">Description</h3>
                <p style="color:#666; font-size:15px; line-height:1.8;">${topic.description || 'No description available.'}</p>
            </div>
            
            <div style="background:#f8f9fa; padding:25px; border-radius:10px; border-left:4px solid #1a73e8;">
                <h3 style="color:#333; margin-bottom:15px;">Detailed Content</h3>
                <div style="color:#444; font-size:15px; line-height:1.9;">
                    ${topic.content || 'No detailed content available.'}
                </div>
            </div>
            
            <div style="margin-top:30px; padding-top:20px; border-top:1px solid #eee; text-align:center;">
                <p style="color:#999; margin-bottom:15px;">Was this article helpful?</p>
                <button onclick="incrementViewCount('${topic.id}'); showToast('Thank you for your feedback!', 'success');" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 10px 25px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 14px;
                    margin: 0 5px;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">
                    <i class="fas fa-thumbs-up"></i> Yes
                </button>
                <button onclick="showToast('We will improve this article. Thank you!', 'info');" style="
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 10px 25px;
                    border-radius: 25px;
                    cursor: pointer;
                    font-size: 14px;
                    margin: 0 5px;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">
                    <i class="fas fa-thumbs-down"></i> No
                </button>
            </div>
        </div>
    `;
    
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
    if (topicsTitle) {
        topicsTitle.textContent = selectedCategory === 'all' ? 'All Help Topics' : `${selectedCategory} Topics`;
    }
    
    filterAndRenderTopics();
}

// ==================== IN-PAGE LOGIN MODAL ====================
function showLoginModal() {
    const existingModal = document.getElementById('loginModalOverlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease;
    `;
    
    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: slideUp 0.3s ease;
        ">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 15px;
                ">
                    <i class="fas fa-user-graduate" style="font-size: 28px; color: white;"></i>
                </div>
                <h3 style="margin: 0; color: #333;">School Portal Login</h3>
                <p style="color: #666; font-size: 13px; margin: 5px 0 0;">Sign in with your Cousins University account</p>
            </div>
            
            <div id="loginError" style="display: none; background: #f8d7da; color: #721c24; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; text-align: center;"></div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Email</label>
                <input type="email" id="loginEmailInput" placeholder="your.email@example.com" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #dee2e6;
                    border-radius: 10px;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Password</label>
                <div style="position: relative;">
                    <input type="password" id="loginPasswordInput" placeholder="Enter your password" style="
                        width: 100%;
                        padding: 12px 45px 12px 15px;
                        border: 2px solid #dee2e6;
                        border-radius: 10px;
                        font-size: 14px;
                        box-sizing: border-box;
                    ">
                    <button type="button" id="togglePasswordBtn" style="
                        position: absolute;
                        right: 10px;
                        top: 50%;
                        transform: translateY(-50%);
                        background: none;
                        border: none;
                        color: #999;
                        cursor: pointer;
                        font-size: 16px;
                        padding: 5px;
                    "><i class="fas fa-eye"></i></button>
                </div>
            </div>
            
            <button id="loginSubmitBtn" style="
                width: 100%;
                padding: 12px;
                background: #1a73e8;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                margin-bottom: 10px;
            " onmouseover="this.style.background='#1557b0'" onmouseout="this.style.background='#1a73e8'">
                <i class="fas fa-sign-in-alt"></i> Sign In
            </button>
            
            <button id="loginCancelBtn" style="
                width: 100%;
                padding: 10px;
                background: transparent;
                color: #666;
                border: 1px solid #dee2e6;
                border-radius: 10px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.3s;
            ">
                Cancel
            </button>
            
            <p style="text-align: center; margin-top: 15px; font-size: 12px; color: #999;">
                Don't have an account? <a href="#" id="switchToRegisterLink" style="color: #1a73e8; text-decoration: none;">Register here</a>
            </p>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('togglePasswordBtn').addEventListener('click', () => {
        const passwordInput = document.getElementById('loginPasswordInput');
        const icon = document.querySelector('#togglePasswordBtn i');
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            passwordInput.type = 'password';
            icon.className = 'fas fa-eye';
        }
    });
    
    document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmailInput').value.trim();
        const password = document.getElementById('loginPasswordInput').value;
        const errorDiv = document.getElementById('loginError');
        
        if (!email || !password) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Please enter both email and password.';
            return;
        }
        
        const submitBtn = document.getElementById('loginSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
        
        try {
            await schoolAuth.signInWithEmailAndPassword(email, password);
            overlay.remove();
            showToast('Login successful!', 'success');
        } catch (error) {
            errorDiv.style.display = 'block';
            let errorMsg = 'Login failed. Please try again.';
            if (error.code === 'auth/user-not-found') errorMsg = 'No account found with this email.';
            else if (error.code === 'auth/wrong-password') errorMsg = 'Incorrect password.';
            else if (error.code === 'auth/invalid-email') errorMsg = 'Invalid email address.';
            else if (error.code === 'auth/too-many-requests') errorMsg = 'Too many attempts. Please try again later.';
            errorDiv.textContent = errorMsg;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        }
    });
    
    document.getElementById('loginCancelBtn').addEventListener('click', () => overlay.remove());
    
    document.getElementById('switchToRegisterLink').addEventListener('click', (e) => {
        e.preventDefault();
        overlay.remove();
        showRegisterModal();
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    
    document.getElementById('loginPasswordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginSubmitBtn').click();
    });
    
    setTimeout(() => document.getElementById('loginEmailInput').focus(), 100);
}

function showRegisterModal() {
    const existingModal = document.getElementById('loginModalOverlay');
    if (existingModal) existingModal.remove();
    
    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 10000;
        display: flex; justify-content: center; align-items: center;
        animation: fadeIn 0.3s ease;
    `;
    
    overlay.innerHTML = `
        <div style="background: white; border-radius: 15px; padding: 30px; max-width: 400px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <i class="fas fa-user-plus" style="font-size: 28px; color: white;"></i>
                </div>
                <h3 style="margin: 0; color: #333;">Create Account</h3>
            </div>
            <div id="registerError" style="display: none; background: #f8d7da; color: #721c24; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px;"></div>
            <div id="registerSuccess" style="display: none; background: #d4edda; color: #155724; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px;"></div>
            <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Full Name</label>
            <input type="text" id="registerNameInput" style="width: 100%; padding: 12px 15px; border: 2px solid #dee2e6; border-radius: 10px; font-size: 14px; box-sizing: border-box;"></div>
            <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Email</label>
            <input type="email" id="registerEmailInput" style="width: 100%; padding: 12px 15px; border: 2px solid #dee2e6; border-radius: 10px; font-size: 14px; box-sizing: border-box;"></div>
            <div style="margin-bottom: 15px;"><label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Password</label>
            <input type="password" id="registerPasswordInput" style="width: 100%; padding: 12px 15px; border: 2px solid #dee2e6; border-radius: 10px; font-size: 14px; box-sizing: border-box;"></div>
            <div style="margin-bottom: 20px;"><label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Confirm Password</label>
            <input type="password" id="registerConfirmPasswordInput" style="width: 100%; padding: 12px 15px; border: 2px solid #dee2e6; border-radius: 10px; font-size: 14px; box-sizing: border-box;"></div>
            <button id="registerSubmitBtn" style="width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; margin-bottom: 10px;">Create Account</button>
            <button id="registerCancelBtn" style="width: 100%; padding: 10px; background: transparent; color: #666; border: 1px solid #dee2e6; border-radius: 10px; cursor: pointer;">Cancel</button>
            <p style="text-align: center; margin-top: 15px; font-size: 12px;">Already have an account? <a href="#" id="switchToLoginLink" style="color: #1a73e8;">Sign in</a></p>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('registerSubmitBtn').addEventListener('click', async () => {
        const name = document.getElementById('registerNameInput').value.trim();
        const email = document.getElementById('registerEmailInput').value.trim();
        const password = document.getElementById('registerPasswordInput').value;
        const confirmPassword = document.getElementById('registerConfirmPasswordInput').value;
        const errorDiv = document.getElementById('registerError');
        const successDiv = document.getElementById('registerSuccess');
        errorDiv.style.display = 'none'; successDiv.style.display = 'none';
        
        if (!name || !email || !password || !confirmPassword) { errorDiv.style.display = 'block'; errorDiv.textContent = 'Please fill in all fields.'; return; }
        if (password.length < 6) { errorDiv.style.display = 'block'; errorDiv.textContent = 'Password must be at least 6 characters.'; return; }
        if (password !== confirmPassword) { errorDiv.style.display = 'block'; errorDiv.textContent = 'Passwords do not match.'; return; }
        
        const submitBtn = document.getElementById('registerSubmitBtn');
        submitBtn.disabled = true; submitBtn.innerHTML = 'Creating...';
        try {
            const cred = await schoolAuth.createUserWithEmailAndPassword(email, password);
            await usersRef.child(cred.user.uid).set({ name: name, email: email, createdAt: Date.now() });
            successDiv.style.display = 'block'; successDiv.textContent = 'Account created! Redirecting...';
            setTimeout(() => { overlay.remove(); showLoginModal(); }, 1500);
        } catch (error) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = error.code === 'auth/email-already-in-use' ? 'Email already registered.' : 'Registration failed.';
        } finally { submitBtn.disabled = false; submitBtn.innerHTML = 'Create Account'; }
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
        showToast('Logged out successfully', 'info');
    }).catch((error) => { showToast('Logout failed: ' + error.message, 'error'); });
}

// ==================== AUTH UI UPDATE ====================
function updateAuthUI() {
    const liveChatBtn = document.getElementById('liveChatBtn');
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const contactSection = document.querySelector('.contact-support-section');
    
    if (isAuthenticated && studentInfo) {
        if (liveChatBtn) { liveChatBtn.disabled = false; liveChatBtn.style.opacity = '1'; liveChatBtn.style.cursor = 'pointer'; }
        if (voiceCallBtn) { voiceCallBtn.disabled = false; voiceCallBtn.style.opacity = '1'; voiceCallBtn.style.cursor = 'pointer'; }
        const existingPrompt = document.getElementById('authRequiredPrompt');
        if (existingPrompt) existingPrompt.remove();
    } else {
        if (liveChatBtn) { liveChatBtn.disabled = true; liveChatBtn.style.opacity = '0.6'; liveChatBtn.style.cursor = 'not-allowed'; }
        if (voiceCallBtn) { voiceCallBtn.disabled = true; voiceCallBtn.style.opacity = '0.6'; voiceCallBtn.style.cursor = 'not-allowed'; }
        if (contactSection && !document.getElementById('authRequiredPrompt')) {
            const promptDiv = document.createElement('div');
            promptDiv.id = 'authRequiredPrompt';
            promptDiv.style.cssText = 'background:#fff3cd; border:2px solid #ffc107; border-radius:10px; padding:15px 20px; margin-top:15px; text-align:center;';
            promptDiv.innerHTML = '<i class="fas fa-lock" style="font-size:20px;color:#e65100;margin-bottom:8px;display:block;"></i><strong style="color:#e65100;">Authentication Required</strong><p style="margin:8px 0;color:#666;">Please log in to access Live Chat and Voice Call.</p><button id="loginPromptBtn" style="background:#1a73e8;color:white;border:none;padding:10px 25px;border-radius:25px;font-size:14px;font-weight:600;cursor:pointer;">Login Here</button>';
            contactSection.appendChild(promptDiv);
            document.getElementById('loginPromptBtn').addEventListener('click', showLoginModal);
        }
    }
}

// ==================== LOAD STUDENT DATA ====================
async function loadStudentDataFromSchool(user) {
    try {
        const userSnapshot = await usersRef.child(user.uid).once('value');
        const userData = userSnapshot.val();
        const appSnapshot = await applicationsRef.orderByChild('userId').equalTo(user.uid).once('value');
        let applicationData = null;
        if (appSnapshot.exists()) { appSnapshot.forEach(snap => { applicationData = snap.val(); }); }
        
        studentInfo = {
            userId: user.uid,
            userName: userData?.name || applicationData?.fullName || user.email?.split('@')[0] || 'Student',
            userEmail: user.email || '',
            applicationStatus: applicationData?.status || 'unknown',
            educationLevel: applicationData?.educationLevel || '',
            yearLevel: applicationData?.yearLevel || '',
            strandCourse: applicationData?.strandCourse || '',
            isEnrolled: applicationData?.status === 'approved'
        };
        sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        updateAuthUI(); displayUserInfo();
        console.log('Student data loaded:', studentInfo);
    } catch (error) {
        console.error('Error loading student data:', error);
        studentInfo = null; isAuthenticated = false;
        updateAuthUI(); displayUserInfo();
    }
}

function updateSupportRequestData() {
    if (!studentInfo || !isAuthenticated) return;
    if (currentChatId) chatQueueRef.child(currentChatId).update({ studentId: studentInfo.userId, studentName: studentInfo.userName, studentEmail: studentInfo.userEmail });
    if (currentCallId) callQueueRef.child(currentCallId).update({ studentId: studentInfo.userId, studentName: studentInfo.userName, studentEmail: studentInfo.userEmail });
}

function displayUserInfo() {
    const userInfo = document.getElementById('userInfo');
    if (!userInfo) return;
    if (isAuthenticated && studentInfo) {
        const initial = (studentInfo.userName || 'S').charAt(0).toUpperCase();
        const badge = studentInfo.isEnrolled ? '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">Enrolled</span>' : '<span style="background:#ffc107;color:#333;padding:2px 8px;border-radius:10px;font-size:11px;">Applicant</span>';
        userInfo.innerHTML = `<div class="user-avatar">${initial}</div><div><strong>${studentInfo.userName}</strong> ${badge}<br><small>${studentInfo.userEmail}</small><br><a href="#" id="logoutLink" style="color:#dc3545;font-size:12px;text-decoration:none;"><i class="fas fa-sign-out-alt"></i> Logout</a></div>`;
        document.getElementById('logoutLink').addEventListener('click', (e) => { e.preventDefault(); handleLogout(); });
    } else {
        userInfo.innerHTML = `<div class="user-avatar" style="background:#dc3545;cursor:pointer;" id="loginAvatarBtn"><i class="fas fa-user-lock"></i></div><div><strong style="color:#dc3545;">Not Logged In</strong><br><a href="#" id="loginLink" style="color:#1a73e8;font-size:13px;text-decoration:none;">Sign In</a></div>`;
        document.getElementById('loginLink').addEventListener('click', (e) => { e.preventDefault(); showLoginModal(); });
        document.getElementById('loginAvatarBtn').addEventListener('click', showLoginModal);
    }
}

// ==================== SUPPORT TYPES ====================
function loadSupportTypes() { supportTypesRef.on('value', (snapshot) => { console.log('Support types:', snapshot.val()); }); }

// ==================== CATEGORIES ====================
function loadCategories() {
    console.log('Loading categories from support database...');
    categoriesRef.on('value', (snapshot) => {
        allCategories = [];
        const categories = snapshot.val() || {};
        console.log('Categories loaded:', categories);
        console.log('Categories count:', Object.keys(categories).length);
        
        Object.entries(categories).forEach(([key, value]) => {
            allCategories.push({ id: key, ...value });
        });
        
        categoriesLoaded = true;
        renderCategories();
    }, (error) => {
        console.error('Error loading categories:', error);
        categoriesLoaded = true;
    });
}

function renderCategories() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;
    
    const counts = {};
    allTopics.forEach(topic => {
        const cat = topic.category || 'Uncategorized';
        counts[cat] = (counts[cat] || 0) + 1;
    });
    
    const countAllElement = document.getElementById('countAll');
    if (countAllElement) countAllElement.textContent = allTopics.length;
    
    let html = `<li class="category-item ${selectedCategory === 'all' ? 'active' : ''}" data-category="all"><i class="fas fa-list"></i> All Topics<span class="category-count">${allTopics.length}</span></li>`;
    
    allCategories.forEach(cat => {
        const count = counts[cat.name] || 0;
        html += `<li class="category-item ${selectedCategory === cat.name ? 'active' : ''}" data-category="${cat.name}"><i class="fas ${cat.icon || 'fa-folder'}"></i> ${cat.name}<span class="category-count">${count}</span></li>`;
    });
    
    const uncategorizedCount = counts['Uncategorized'] || 0;
    if (uncategorizedCount > 0 && !allCategories.find(c => c.name === 'Uncategorized')) {
        html += `<li class="category-item ${selectedCategory === 'Uncategorized' ? 'active' : ''}" data-category="Uncategorized"><i class="fas fa-folder"></i> Uncategorized<span class="category-count">${uncategorizedCount}</span></li>`;
    }
    
    categoryList.innerHTML = html;
    
    categoryList.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedCategory = item.dataset.category;
            categoryList.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            filterAndRenderTopics();
        });
    });
}

// ==================== TOPICS ====================
function loadTopics() {
    console.log('Loading topics from support database...');
    
    // Use once() for initial load
    topicsRef.once('value', (snapshot) => {
        allTopics = [];
        const topics = snapshot.val() || {};
        
        console.log('Topics raw data:', topics);
        console.log('Topics exists:', snapshot.exists());
        console.log('Topics count:', Object.keys(topics).length);
        
        Object.entries(topics).forEach(([key, value]) => {
            allTopics.push({ id: key, ...value });
        });
        
        topicsLoaded = true;
        console.log('Topics array:', allTopics);
        renderCategories();
        filterAndRenderTopics();
        
        // Now set up real-time listener
        setupTopicsListener();
        
    }).catch((error) => {
        console.error('Error loading topics:', error);
        topicsLoaded = true;
        const topicsGrid = document.getElementById('topicsGrid');
        if (topicsGrid) {
            topicsGrid.innerHTML = `<div style="text-align:center;padding:40px;color:#dc3545;"><i class="fas fa-exclamation-triangle" style="font-size:40px;margin-bottom:15px;display:block;"></i><p>Failed to load topics.</p><p style="font-size:13px;">Error: ${error.message}</p><button onclick="location.reload()" style="margin-top:15px;padding:10px 20px;background:#1a73e8;color:white;border:none;border-radius:25px;cursor:pointer;">Refresh Page</button></div>`;
        }
    });
}

function setupTopicsListener() {
    topicsRef.on('value', (snapshot) => {
        if (!topicsLoaded) return;
        
        allTopics = [];
        const topics = snapshot.val() || {};
        Object.entries(topics).forEach(([key, value]) => {
            allTopics.push({ id: key, ...value });
        });
        
        console.log('Topics updated via listener. Count:', allTopics.length);
        renderCategories();
        if (!currentTopicView) filterAndRenderTopics();
    });
}

function filterAndRenderTopics() {
    if (currentTopicView) return;
    
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    let filtered = [...allTopics];
    
    if (selectedCategory !== 'all') {
        filtered = filtered.filter(t => (t.category || 'Uncategorized') === selectedCategory);
    }
    if (searchTerm) {
        filtered = filtered.filter(t => (t.title || '').toLowerCase().includes(searchTerm) || (t.description || '').toLowerCase().includes(searchTerm) || (t.content || '').toLowerCase().includes(searchTerm));
    }
    
    if (sortOrder === 'newest') filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (sortOrder === 'popular') filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sortOrder === 'az') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    
    renderTopics(filtered);
}

function renderTopics(topics) {
    const topicsGrid = document.getElementById('topicsGrid');
    const noTopics = document.getElementById('noTopics');
    const topicsTitle = document.getElementById('topicsTitle');
    if (!topicsGrid || currentTopicView) return;
    
    if (!topicsLoaded) {
        topicsGrid.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i><p>Loading topics...</p></div>';
        return;
    }
    
    if (topics.length === 0) {
        topicsGrid.innerHTML = '';
        if (noTopics) noTopics.style.display = 'block';
        if (topicsTitle) topicsTitle.textContent = allTopics.length === 0 ? 'No Topics Available Yet' : 'No Topics Found';
        return;
    }
    
    if (noTopics) noTopics.style.display = 'none';
    if (topicsTitle) topicsTitle.textContent = selectedCategory === 'all' ? 'All Help Topics' : `${selectedCategory} Topics`;
    
    let html = '';
    topics.forEach(topic => {
        const createdDate = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown';
        const isNew = topic.createdAt && (Date.now() - topic.createdAt) < 7 * 24 * 60 * 60 * 1000;
        const isPopular = (topic.views || 0) > 100;
        let badgeHtml = isNew ? '<span class="topic-badge badge-new">NEW</span>' : (isPopular ? '<span class="topic-badge badge-popular">POPULAR</span>' : '');
        const tagsHtml = (topic.tags || []).map(tag => `<span style="background:#e9ecef;padding:2px 8px;border-radius:10px;font-size:12px;">#${tag}</span>`).join(' ');
        
        html += `<div class="topic-card" onclick="openTopicDetail('${topic.id}')" style="cursor:pointer;"><div class="topic-card-header"><div class="topic-title"><i class="fas fa-file-alt" style="color:var(--primary);"></i>${topic.title || 'Untitled'}${badgeHtml}</div></div><div class="topic-description">${topic.description || 'No description'}</div><div class="topic-meta"><span><i class="fas fa-eye"></i>${topic.views || 0} views</span><span><i class="fas fa-calendar"></i>${createdDate}</span><span><i class="fas fa-folder"></i>${topic.category || 'Uncategorized'}</span></div>${tagsHtml ? `<div style="margin-top:10px;">${tagsHtml}</div>` : ''}</div>`;
    });
    topicsGrid.innerHTML = html;
}

function openTopicDetail(topicId) { window.location.hash = 'topic/' + topicId; }
window.toggleTopic = function(card, topicId) { openTopicDetail(topicId); };

async function incrementViewCount(topicId) {
    try {
        const topicRef = topicsRef.child(topicId);
        const snapshot = await topicRef.once('value');
        const topic = snapshot.val();
        if (topic) await topicRef.update({ views: (topic.views || 0) + 1 });
    } catch (error) { console.error('Error incrementing view count:', error); }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    document.getElementById('searchInput')?.addEventListener('input', debounce(() => filterAndRenderTopics(), 300));
    document.getElementById('sortBtn')?.addEventListener('click', () => {
        const orders = ['newest', 'oldest', 'popular', 'az'];
        sortOrder = orders[(orders.indexOf(sortOrder) + 1) % orders.length];
        document.getElementById('sortBtn').innerHTML = `<i class="fas fa-sort-amount-down"></i> ${sortOrder.charAt(0).toUpperCase()+sortOrder.slice(1)} First`;
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

function debounce(func, wait) {
    let timeout;
    return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

// ==================== CSR STATUS ====================
function monitorCSRStatus() {
    csrStatusRef.on('value', (snapshot) => {
        const status = snapshot.val() || {};
        const queueStatus = document.getElementById('queueStatus');
        if (!queueStatus) return;
        const onlineCSRs = Object.values(status).filter(csr => csr.status === 'online').length;
        queueStatus.innerHTML = onlineCSRs > 0 ? `<i class="fas fa-circle" style="color:#2e7d32;"></i><span>${onlineCSRs} CSR${onlineCSRs>1?'s':''} Available</span>` : `<i class="fas fa-circle" style="color:#e65100;"></i><span>No CSRs Available</span>`;
        queueStatus.className = 'queue-status' + (onlineCSRs === 0 ? ' busy' : '');
    });
}

// ==================== LIVE CHAT ====================
function openLiveChat() {
    if (!isAuthenticated || !studentInfo) { showLoginModal(); return; }
    const modal = document.getElementById('chatModal');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').disabled = true;
    document.getElementById('chatSendBtn').disabled = true;
    document.getElementById('queueInfo').innerHTML = '<i class="fas fa-clock"></i> Connecting...';
    
    const chatRequest = { studentId: studentInfo.userId, studentName: studentInfo.userName, studentEmail: studentInfo.userEmail, status: 'waiting', createdAt: firebase.database.ServerValue.TIMESTAMP, messages: [] };
    const newChatRef = chatQueueRef.push();
    currentChatId = newChatRef.key;
    newChatRef.set(chatRequest);
    listenForCSRAssignment(currentChatId);
}

function listenForCSRAssignment(chatId) {
    chatListener = chatQueueRef.child(chatId).on('value', (snapshot) => {
        const chat = snapshot.val();
        if (!chat) return;
        const queueInfo = document.getElementById('queueInfo');
        if (chat.status === 'connected') {
            queueInfo.innerHTML = `<i class="fas fa-check-circle"></i> Connected with ${chat.csrName || 'Support Agent'}`;
            queueInfo.className = 'queue-info connected';
            document.getElementById('chatInput').disabled = false;
            document.getElementById('chatSendBtn').disabled = false;
            document.getElementById('chatInput').focus();
        } else if (chat.status === 'ended') {
            queueInfo.innerHTML = 'Chat ended';
            document.getElementById('chatInput').disabled = true;
            document.getElementById('chatSendBtn').disabled = true;
        }
        if (chat.messages) renderChatMessages(chat.messages);
    });
}

function renderChatMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages || !Array.isArray(messages)) return;
    let html = '';
    messages.forEach(msg => {
        if (msg.sender === 'student') html += `<div class="message user"><div class="message-avatar">${(studentInfo?.userName||'S').charAt(0)}</div><div><div class="message-bubble">${msg.text}</div><div class="message-time">${formatTime(msg.timestamp)}</div></div></div>`;
        else html += `<div class="message support"><div class="message-avatar">CSR</div><div><div class="message-bubble">${msg.text}</div><div class="message-time">${formatTime(msg.timestamp)}</div></div></div>`;
    });
    chatMessages.innerHTML = html;
    chatMessages.scrollTop = chatMessages.scrollHeight;
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

function formatTime(timestamp) { return timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''; }

// ==================== VOICE CALL ====================
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
    callListener = callQueueRef.child(callId).on('value', async (snapshot) => {
        const call = snapshot.val();
        if (!call) return;
        if (call.status === 'connected' && call.offer) {
            document.getElementById('callStatus').textContent = `Connected with ${call.csrName || 'Agent'}`;
            startCallTimer();
            await createPeerConnection(callId);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await callQueueRef.child(callId).update({ answer });
        } else if (call.status === 'ended') endVoiceCall();
    });
}

async function createPeerConnection(callId) {
    peerConnection = new RTCPeerConnection(configuration);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = (event) => { if (event.candidate) callQueueRef.child(callId).child('iceCandidates').child('student').push({ candidate: event.candidate.toJSON() }); };
    callQueueRef.child(callId).child('iceCandidates').child('csr').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data?.candidate && peerConnection) peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
    peerConnection.onconnectionstatechange = () => { if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') endVoiceCall(); };
    peerConnection.ontrack = (event) => { const audio = new Audio(); audio.srcObject = event.streams[0]; audio.play().catch(e => {}); };
}

function startCallTimer() { callStartTime = Date.now(); updateCallTimer(); callTimerInterval = setInterval(updateCallTimer, 1000); }
function updateCallTimer() { const timer = document.getElementById('callTimer'); if (timer && callStartTime) { const elapsed = Math.floor((Date.now()-callStartTime)/1000); timer.textContent = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`; } }
function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => track.enabled = !isMuted);
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) { muteBtn.classList.toggle('active', isMuted); muteBtn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>'; }
}
function endVoiceCall() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(track => track.stop()); localStream = null; }
    if (currentCallId) { callQueueRef.child(currentCallId).update({ status: 'ended' }); currentCallId = null; }
    document.getElementById('callModal')?.classList.remove('active');
    callStartTime = null;
    const timer = document.getElementById('callTimer'); if (timer) timer.textContent = '00:00';
    const status = document.getElementById('callStatus'); if (status) status.textContent = 'Call ended';
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
    toast.addEventListener('click', () => toast.remove());
}

// ==================== CLEANUP ====================
window.addEventListener('beforeunload', () => {
    if (currentChatId) chatQueueRef.child(currentChatId).update({ status: 'ended' });
    if (currentCallId) callQueueRef.child(currentCallId).update({ status: 'ended' });
    endVoiceCall();
});
