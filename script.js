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
const supportFirebaseConfig = {
  apiKey: "AIzaSyB-f_fQ3OlB5kDqQsNVsTr5X6fs06AHRGQ",
  authDomain: "class-learn-support.firebaseapp.com",
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
    // Find the topic
    const topic = allTopics.find(t => t.id === topicId);
    if (!topic) {
        window.location.hash = '';
        return;
    }
    
    currentTopicView = topicId;
    
    // Hide topics grid and show detail
    const topicsGrid = document.getElementById('topicsGrid');
    const noTopics = document.getElementById('noTopics');
    const topicsTitle = document.getElementById('topicsTitle');
    const searchBar = document.querySelector('.search-bar');
    const sortBtn = document.getElementById('sortBtn');
    const topicsHeader = document.querySelector('.topics-header');
    
    // Create back button area if not exists
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
    
    // Hide search and sort
    if (searchBar) searchBar.style.display = 'none';
    if (sortBtn) sortBtn.style.display = 'none';
    if (noTopics) noTopics.style.display = 'none';
    
    // Update title
    if (topicsTitle) {
        topicsTitle.innerHTML = `<i class="fas fa-file-alt" style="color:var(--primary);"></i> ${topic.title || 'Untitled'}`;
    }
    
    // Render topic detail
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
    
    // Increment view
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
                    transition: border-color 0.3s;
                " onfocus="this.style.borderColor='#1a73e8'" onblur="this.style.borderColor='#dee2e6'">
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
                        transition: border-color 0.3s;
                    " onfocus="this.style.borderColor='#1a73e8'" onblur="this.style.borderColor='#dee2e6'">
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
            " onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='transparent'">
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
            if (error.code === 'auth/user-not-found') {
                errorMsg = 'No account found with this email.';
            } else if (error.code === 'auth/wrong-password') {
                errorMsg = 'Incorrect password.';
            } else if (error.code === 'auth/invalid-email') {
                errorMsg = 'Invalid email address.';
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg = 'Too many attempts. Please try again later.';
            }
            errorDiv.textContent = errorMsg;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
        }
    });
    
    document.getElementById('loginCancelBtn').addEventListener('click', () => {
        overlay.remove();
    });
    
    document.getElementById('switchToRegisterLink').addEventListener('click', (e) => {
        e.preventDefault();
        overlay.remove();
        showRegisterModal();
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
    
    document.getElementById('loginPasswordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('loginSubmitBtn').click();
        }
    });
    
    setTimeout(() => document.getElementById('loginEmailInput').focus(), 100);
}

function showRegisterModal() {
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
                    <i class="fas fa-user-plus" style="font-size: 28px; color: white;"></i>
                </div>
                <h3 style="margin: 0; color: #333;">Create Account</h3>
                <p style="color: #666; font-size: 13px; margin: 5px 0 0;">Register for a school portal account</p>
            </div>
            
            <div id="registerError" style="display: none; background: #f8d7da; color: #721c24; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; text-align: center;"></div>
            <div id="registerSuccess" style="display: none; background: #d4edda; color: #155724; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; text-align: center;"></div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Full Name</label>
                <input type="text" id="registerNameInput" placeholder="Juan Dela Cruz" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #dee2e6;
                    border-radius: 10px;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Email</label>
                <input type="email" id="registerEmailInput" placeholder="your.email@example.com" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #dee2e6;
                    border-radius: 10px;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Password</label>
                <input type="password" id="registerPasswordInput" placeholder="Min. 6 characters" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #dee2e6;
                    border-radius: 10px;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: 600; font-size: 13px;">Confirm Password</label>
                <input type="password" id="registerConfirmPasswordInput" placeholder="Re-enter password" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #dee2e6;
                    border-radius: 10px;
                    font-size: 14px;
                    box-sizing: border-box;
                ">
            </div>
            
            <button id="registerSubmitBtn" style="
                width: 100%;
                padding: 12px;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 15px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                margin-bottom: 10px;
            " onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">
                <i class="fas fa-user-plus"></i> Create Account
            </button>
            
            <button id="registerCancelBtn" style="
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
                Already have an account? <a href="#" id="switchToLoginLink" style="color: #1a73e8; text-decoration: none;">Sign in</a>
            </p>
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
        
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        
        if (!name || !email || !password || !confirmPassword) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Please fill in all fields.';
            return;
        }
        
        if (password.length < 6) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Password must be at least 6 characters.';
            return;
        }
        
        if (password !== confirmPassword) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'Passwords do not match.';
            return;
        }
        
        const submitBtn = document.getElementById('registerSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        
        try {
            const cred = await schoolAuth.createUserWithEmailAndPassword(email, password);
            await usersRef.child(cred.user.uid).set({
                name: name,
                email: email,
                createdAt: Date.now()
            });
            
            successDiv.style.display = 'block';
            successDiv.textContent = 'Account created! Redirecting to login...';
            
            setTimeout(() => {
                overlay.remove();
                showLoginModal();
            }, 1500);
            
        } catch (error) {
            errorDiv.style.display = 'block';
            let errorMsg = 'Registration failed.';
            if (error.code === 'auth/email-already-in-use') {
                errorMsg = 'This email is already registered.';
            } else if (error.code === 'auth/invalid-email') {
                errorMsg = 'Invalid email address.';
            } else if (error.code === 'auth/weak-password') {
                errorMsg = 'Password is too weak.';
            }
            errorDiv.textContent = errorMsg;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
        }
    });
    
    document.getElementById('registerCancelBtn').addEventListener('click', () => {
        overlay.remove();
    });
    
    document.getElementById('switchToLoginLink').addEventListener('click', (e) => {
        e.preventDefault();
        overlay.remove();
        showLoginModal();
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

function handleLogout() {
    schoolAuth.signOut().then(() => {
        sessionStorage.removeItem('studentInfo');
        currentSchoolUser = null;
        isAuthenticated = false;
        studentInfo = null;
        updateAuthUI();
        displayUserInfo();
        showToast('Logged out successfully', 'info');
    }).catch((error) => {
        showToast('Logout failed: ' + error.message, 'error');
    });
}

// ==================== AUTH UI UPDATE ====================
function updateAuthUI() {
    const liveChatBtn = document.getElementById('liveChatBtn');
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const contactSection = document.querySelector('.contact-support-section');
    
    if (isAuthenticated && studentInfo) {
        if (liveChatBtn) {
            liveChatBtn.disabled = false;
            liveChatBtn.style.opacity = '1';
            liveChatBtn.style.cursor = 'pointer';
            liveChatBtn.title = 'Start Live Chat';
        }
        if (voiceCallBtn) {
            voiceCallBtn.disabled = false;
            voiceCallBtn.style.opacity = '1';
            voiceCallBtn.style.cursor = 'pointer';
            voiceCallBtn.title = 'Start Voice Call';
        }
        
        const existingPrompt = document.getElementById('authRequiredPrompt');
        if (existingPrompt) {
            existingPrompt.remove();
        }
    } else {
        if (liveChatBtn) {
            liveChatBtn.disabled = true;
            liveChatBtn.style.opacity = '0.6';
            liveChatBtn.style.cursor = 'not-allowed';
            liveChatBtn.title = 'Login required to use Live Chat';
        }
        if (voiceCallBtn) {
            voiceCallBtn.disabled = true;
            voiceCallBtn.style.opacity = '0.6';
            voiceCallBtn.style.cursor = 'not-allowed';
            voiceCallBtn.title = 'Login required to use Voice Call';
        }
        
        if (contactSection && !document.getElementById('authRequiredPrompt')) {
            const promptDiv = document.createElement('div');
            promptDiv.id = 'authRequiredPrompt';
            promptDiv.style.cssText = `
                background: #fff3cd;
                border: 2px solid #ffc107;
                border-radius: 10px;
                padding: 15px 20px;
                margin-top: 15px;
                text-align: center;
                animation: fadeIn 0.3s ease;
            `;
            promptDiv.innerHTML = `
                <i class="fas fa-lock" style="font-size: 20px; color: #e65100; margin-bottom: 8px; display: block;"></i>
                <strong style="color: #e65100;">Authentication Required</strong>
                <p style="margin: 8px 0; color: #666;">Please log in to your school portal account to access Live Chat and Voice Call support.</p>
                <button id="loginPromptBtn" style="
                    background: #1a73e8;
                    color: white;
                    border: none;
                    padding: 10px 25px;
                    border-radius: 25px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#1557b0'; this.style.transform='translateY(-2px)';" 
                   onmouseout="this.style.background='#1a73e8'; this.style.transform='translateY(0)';">
                    <i class="fas fa-sign-in-alt"></i> Login Here
                </button>
            `;
            contactSection.appendChild(promptDiv);
            
            document.getElementById('loginPromptBtn').addEventListener('click', () => {
                showLoginModal();
            });
        }
    }
}

// ==================== LOAD STUDENT DATA FROM SCHOOL ENROLLMENT SYSTEM ====================
async function loadStudentDataFromSchool(user) {
    try {
        const userSnapshot = await usersRef.child(user.uid).once('value');
        const userData = userSnapshot.val();
        
        const appSnapshot = await applicationsRef.orderByChild('userId').equalTo(user.uid).once('value');
        let applicationData = null;
        
        if (appSnapshot.exists()) {
            appSnapshot.forEach(snap => {
                applicationData = snap.val();
            });
        }
        
        studentInfo = {
            userId: user.uid,
            userName: userData?.name || applicationData?.fullName || user.displayName || user.email?.split('@')[0] || 'Student',
            userEmail: user.email || '',
            applicationStatus: applicationData?.status || 'unknown',
            educationLevel: applicationData?.educationLevel || '',
            yearLevel: applicationData?.yearLevel || '',
            strandCourse: applicationData?.strandCourse || '',
            isEnrolled: applicationData?.status === 'approved'
        };
        
        sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        
        updateAuthUI();
        displayUserInfo();
        updateSupportRequestData();
        
        console.log('Student data loaded from school enrollment system:', studentInfo);
        
    } catch (error) {
        console.error('Error loading student data from school:', error);
        studentInfo = null;
        isAuthenticated = false;
        updateAuthUI();
        displayUserInfo();
    }
}

function updateSupportRequestData() {
    if (!studentInfo || !isAuthenticated) return;
    
    if (currentChatId) {
        chatQueueRef.child(currentChatId).update({
            studentId: studentInfo.userId,
            studentName: studentInfo.userName,
            studentEmail: studentInfo.userEmail,
            educationLevel: studentInfo.educationLevel,
            yearLevel: studentInfo.yearLevel,
            course: studentInfo.strandCourse
        });
    }
    
    if (currentCallId) {
        callQueueRef.child(currentCallId).update({
            studentId: studentInfo.userId,
            studentName: studentInfo.userName,
            studentEmail: studentInfo.userEmail,
            educationLevel: studentInfo.educationLevel,
            yearLevel: studentInfo.yearLevel,
            course: studentInfo.strandCourse
        });
    }
}

function displayUserInfo() {
    const userInfo = document.getElementById('userInfo');
    if (!userInfo) return;
    
    if (isAuthenticated && studentInfo) {
        const initial = (studentInfo.userName || 'S').charAt(0).toUpperCase();
        const statusBadge = studentInfo.isEnrolled 
            ? '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">Enrolled</span>'
            : '<span style="background:#ffc107;color:#333;padding:2px 8px;border-radius:10px;font-size:11px;">Applicant</span>';
        
        userInfo.innerHTML = `
            <div class="user-avatar">${initial}</div>
            <div>
                <strong>${studentInfo.userName}</strong> ${statusBadge}
                <br><small>${studentInfo.userEmail}</small>
                ${studentInfo.strandCourse ? `<br><small style="color:#666;">${studentInfo.strandCourse} - ${studentInfo.yearLevel || ''}</small>` : ''}
                <br><a href="#" id="logoutLink" style="color: #dc3545; font-size: 12px; text-decoration: none;"><i class="fas fa-sign-out-alt"></i> Logout</a>
            </div>
        `;
        
        document.getElementById('logoutLink').addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    } else {
        userInfo.innerHTML = `
            <div class="user-avatar" style="background:#dc3545; cursor:pointer;" id="loginAvatarBtn">
                <i class="fas fa-user-lock"></i>
            </div>
            <div>
                <strong style="color:#dc3545;">Not Logged In</strong>
                <br><a href="#" id="loginLink" style="color: #1a73e8; font-size: 13px; text-decoration: none;"><i class="fas fa-sign-in-alt"></i> Sign In</a>
            </div>
        `;
        
        document.getElementById('loginLink').addEventListener('click', (e) => {
            e.preventDefault();
            showLoginModal();
        });
        
        document.getElementById('loginAvatarBtn').addEventListener('click', () => {
            showLoginModal();
        });
    }
}

// ==================== SUPPORT TYPES (From Admin) ====================
function loadSupportTypes() {
    supportTypesRef.on('value', (snapshot) => {
        const types = snapshot.val() || {};
        console.log('Support types loaded:', types);
    });
}

// ==================== CATEGORIES ====================
function loadCategories() {
    categoriesRef.on('value', (snapshot) => {
        allCategories = [];
        const categories = snapshot.val() || {};
        
        Object.entries(categories).forEach(([key, value]) => {
            allCategories.push({
                id: key,
                ...value
            });
        });
        
        renderCategories();
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
    
    let html = `
        <li class="category-item ${selectedCategory === 'all' ? 'active' : ''}" data-category="all">
            <i class="fas fa-list"></i> All Topics
            <span class="category-count">${allTopics.length}</span>
        </li>
    `;
    
    allCategories.forEach(cat => {
        const count = counts[cat.name] || 0;
        html += `
            <li class="category-item ${selectedCategory === cat.name ? 'active' : ''}" data-category="${cat.name}">
                <i class="fas ${cat.icon || 'fa-folder'}"></i> ${cat.name}
                <span class="category-count">${count}</span>
            </li>
        `;
    });
    
    const uncategorizedCount = counts['Uncategorized'] || 0;
    if (uncategorizedCount > 0 && !allCategories.find(c => c.name === 'Uncategorized')) {
        html += `
            <li class="category-item ${selectedCategory === 'Uncategorized' ? 'active' : ''}" data-category="Uncategorized">
                <i class="fas fa-folder"></i> Uncategorized
                <span class="category-count">${uncategorizedCount}</span>
            </li>
        `;
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
    // Use once() for initial load to fix the stuck loading issue
    topicsRef.once('value', (snapshot) => {
        allTopics = [];
        const topics = snapshot.val() || {};
        
        Object.entries(topics).forEach(([key, value]) => {
            allTopics.push({
                id: key,
                ...value
            });
        });
        
        topicsLoaded = true;
        renderCategories();
        filterAndRenderTopics();
        
        console.log('Topics loaded successfully. Count:', allTopics.length);
    }).catch((error) => {
        console.error('Error loading topics:', error);
        topicsLoaded = true; // Set to true even on error to stop loading spinner
        const topicsGrid = document.getElementById('topicsGrid');
        if (topicsGrid) {
            topicsGrid.innerHTML = `
                <div style="text-align:center; padding:40px; color:#dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size:40px; margin-bottom:15px; display:block;"></i>
                    <p>Failed to load topics. Please check your connection and try refreshing.</p>
                    <button onclick="location.reload()" style="margin-top:15px; padding:10px 20px; background:#1a73e8; color:white; border:none; border-radius:25px; cursor:pointer;">
                        <i class="fas fa-redo"></i> Refresh Page
                    </button>
                </div>
            `;
        }
    });
    
    // Set up real-time listener after initial load
    topicsRef.on('value', (snapshot) => {
        if (!topicsLoaded) return; // Skip if initial load hasn't completed
        
        allTopics = [];
        const topics = snapshot.val() || {};
        
        Object.entries(topics).forEach(([key, value]) => {
            allTopics.push({
                id: key,
                ...value
            });
        });
        
        renderCategories();
        
        // Only re-render if we're not viewing a topic detail
        if (!currentTopicView) {
            filterAndRenderTopics();
        }
    });
}

function filterAndRenderTopics() {
    // Don't render if viewing a topic detail
    if (currentTopicView) return;
    
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    
    let filtered = [...allTopics];
    
    if (selectedCategory !== 'all') {
        filtered = filtered.filter(t => (t.category || 'Uncategorized') === selectedCategory);
    }
    
    if (searchTerm) {
        filtered = filtered.filter(t => 
            (t.title || '').toLowerCase().includes(searchTerm) ||
            (t.description || '').toLowerCase().includes(searchTerm) ||
            (t.content || '').toLowerCase().includes(searchTerm) ||
            (t.tags || []).some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }
    
    if (sortOrder === 'newest') {
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortOrder === 'oldest') {
        filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else if (sortOrder === 'popular') {
        filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (sortOrder === 'az') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    
    renderTopics(filtered);
}

function renderTopics(topics) {
    const topicsGrid = document.getElementById('topicsGrid');
    const noTopics = document.getElementById('noTopics');
    const topicsTitle = document.getElementById('topicsTitle');
    
    if (!topicsGrid) return;
    
    // Don't render if viewing topic detail
    if (currentTopicView) return;
    
    if (!topicsLoaded) {
        topicsGrid.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner"></i>
                <p>Loading topics...</p>
            </div>
        `;
        return;
    }
    
    if (topics.length === 0) {
        topicsGrid.innerHTML = '';
        if (noTopics) noTopics.style.display = 'block';
        if (topicsTitle) topicsTitle.textContent = allTopics.length === 0 ? 'No Topics Available Yet' : 'No Topics Found';
        
        // If no topics at all, show a helpful message
        if (allTopics.length === 0) {
            if (noTopics) {
                noTopics.innerHTML = `
                    <i class="fas fa-book-open"></i>
                    <h3>No Help Topics Yet</h3>
                    <p>The support team is working on creating helpful articles.</p>
                    <p style="font-size:13px; color:#999;">Topics added by the admin will appear here automatically.</p>
                `;
            }
        }
        return;
    }
    
    if (noTopics) noTopics.style.display = 'none';
    if (topicsTitle) {
        topicsTitle.textContent = selectedCategory === 'all' 
            ? 'All Help Topics' 
            : `${selectedCategory} Topics`;
    }
    
    let html = '';
    topics.forEach(topic => {
        const createdDate = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        }) : 'Unknown';
        
        const isNew = topic.createdAt && (Date.now() - topic.createdAt) < 7 * 24 * 60 * 60 * 1000;
        const isPopular = (topic.views || 0) > 100;
        const isUpdated = topic.updatedAt && topic.updatedAt > topic.createdAt;
        
        let badgeHtml = '';
        if (isNew) badgeHtml = '<span class="topic-badge badge-new">NEW</span>';
        else if (isPopular) badgeHtml = '<span class="topic-badge badge-popular">POPULAR</span>';
        else if (isUpdated) badgeHtml = '<span class="topic-badge badge-updated">UPDATED</span>';
        
        const tagsHtml = (topic.tags || []).map(tag => 
            `<span style="background:#e9ecef; padding:2px 8px; border-radius:10px; font-size:12px;">#${tag}</span>`
        ).join(' ');
        
        html += `
            <div class="topic-card" data-id="${topic.id}" onclick="openTopicDetail('${topic.id}')" style="cursor:pointer;">
                <div class="topic-card-header">
                    <div class="topic-title">
                        <i class="fas fa-file-alt" style="color:var(--primary);"></i>
                        ${topic.title || 'Untitled'}
                        ${badgeHtml}
                    </div>
                </div>
                <div class="topic-description">${topic.description || 'No description'}</div>
                <div class="topic-meta">
                    <span><i class="fas fa-eye"></i> ${topic.views || 0} views</span>
                    <span><i class="fas fa-calendar"></i> ${createdDate}</span>
                    <span><i class="fas fa-folder"></i> ${topic.category || 'Uncategorized'}</span>
                </div>
                ${tagsHtml ? `<div style="margin-top:10px;">${tagsHtml}</div>` : ''}
            </div>
        `;
    });
    
    topicsGrid.innerHTML = html;
}

function openTopicDetail(topicId) {
    window.location.hash = 'topic/' + topicId;
}

window.toggleTopic = function(card, topicId) {
    // Legacy support - now redirects to detail page
    openTopicDetail(topicId);
};

async function incrementViewCount(topicId) {
    try {
        const topicRef = topicsRef.child(topicId);
        const snapshot = await topicRef.once('value');
        const topic = snapshot.val();
        if (topic) {
            await topicRef.update({ views: (topic.views || 0) + 1 });
        }
    } catch (error) {
        console.error('Error incrementing view count:', error);
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterAndRenderTopics();
        }, 300));
    }
    
    const sortBtn = document.getElementById('sortBtn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            const orders = ['newest', 'oldest', 'popular', 'az'];
            const currentIndex = orders.indexOf(sortOrder);
            sortOrder = orders[(currentIndex + 1) % orders.length];
            
            const labels = {
                'newest': 'Newest First',
                'oldest': 'Oldest First',
                'popular': 'Most Popular',
                'az': 'A-Z'
            };
            
            sortBtn.innerHTML = `<i class="fas fa-sort-amount-down"></i> ${labels[sortOrder]}`;
            filterAndRenderTopics();
        });
    }
    
    document.getElementById('liveChatBtn')?.addEventListener('click', openLiveChat);
    document.getElementById('chatClose')?.addEventListener('click', closeLiveChat);
    document.getElementById('chatSendBtn')?.addEventListener('click', sendChatMessage);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    document.getElementById('voiceCallBtn')?.addEventListener('click', openVoiceCall);
    document.getElementById('endCallBtn')?.addEventListener('click', endVoiceCall);
    document.getElementById('muteBtn')?.addEventListener('click', toggleMute);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==================== CSR STATUS MONITORING ====================
function monitorCSRStatus() {
    csrStatusRef.on('value', (snapshot) => {
        const status = snapshot.val() || {};
        const queueStatus = document.getElementById('queueStatus');
        
        if (!queueStatus) return;
        
        const onlineCSRs = Object.values(status).filter(csr => csr.status === 'online').length;
        
        if (onlineCSRs > 0) {
            queueStatus.innerHTML = `
                <i class="fas fa-circle" style="color:#2e7d32;"></i>
                <span>${onlineCSRs} CSR${onlineCSRs > 1 ? 's' : ''} Available</span>
            `;
            queueStatus.className = 'queue-status';
        } else {
            queueStatus.innerHTML = `
                <i class="fas fa-circle" style="color:#e65100;"></i>
                <span>No CSRs Available</span>
            `;
            queueStatus.className = 'queue-status busy';
        }
    });
}

// ==================== LIVE CHAT (Requires Authentication) ====================
function openLiveChat() {
    if (!isAuthenticated || !studentInfo) {
        showLoginModal();
        return;
    }
    
    const modal = document.getElementById('chatModal');
    if (!modal) return;
    
    modal.classList.add('active');
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').disabled = true;
    document.getElementById('chatSendBtn').disabled = true;
    
    const queueInfo = document.getElementById('queueInfo');
    queueInfo.innerHTML = '<i class="fas fa-clock"></i> Connecting to support...';
    queueInfo.className = 'queue-info';
    
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
    
    chatListener = chatRef.on('value', (snapshot) => {
        const chat = snapshot.val();
        if (!chat) return;
        
        const queueInfo = document.getElementById('queueInfo');
        
        if (chat.status === 'connected') {
            queueInfo.innerHTML = `<i class="fas fa-check-circle"></i> Connected with ${chat.csrName || 'Support Agent'}`;
            queueInfo.className = 'queue-info connected';
            document.getElementById('chatInput').disabled = false;
            document.getElementById('chatSendBtn').disabled = false;
            document.getElementById('chatInput').focus();
        } else if (chat.status === 'waiting') {
            const position = chat.position || '...';
            queueInfo.innerHTML = `<i class="fas fa-clock"></i> Waiting in queue... (Position: ${position})`;
        } else if (chat.status === 'ended') {
            queueInfo.innerHTML = '<i class="fas fa-check-circle"></i> Chat ended';
            document.getElementById('chatInput').disabled = true;
            document.getElementById('chatSendBtn').disabled = true;
        }
        
        if (chat.messages) {
            renderChatMessages(chat.messages);
        }
    });
}

function renderChatMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    let html = '';
    
    if (Array.isArray(messages)) {
        messages.forEach(msg => {
            if (msg.type === 'system') {
                html += `<div class="chat-system-message">${msg.text}</div>`;
            } else if (msg.sender === 'student') {
                html += `
                    <div class="message user">
                        <div class="message-avatar">${(studentInfo?.userName || 'S').charAt(0)}</div>
                        <div>
                            <div class="message-bubble">${msg.text}</div>
                            <div class="message-time">${formatTime(msg.timestamp)}</div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="message support">
                        <div class="message-avatar">CSR</div>
                        <div>
                            <div class="message-bubble">${msg.text}</div>
                            <div class="message-time">${formatTime(msg.timestamp)}</div>
                        </div>
                    </div>
                `;
            }
        });
    }
    
    chatMessages.innerHTML = html;
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text || !currentChatId) return;
    
    const chatRef = chatQueueRef.child(currentChatId);
    
    chatRef.child('messages').push({
        sender: 'student',
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    
    input.value = '';
}

function closeLiveChat() {
    const modal = document.getElementById('chatModal');
    if (modal) modal.classList.remove('active');
    
    if (currentChatId) {
        chatQueueRef.child(currentChatId).update({ status: 'ended' });
        if (chatListener) {
            chatQueueRef.child(currentChatId).off('value', chatListener);
        }
        currentChatId = null;
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ==================== VOICE CALL (Requires Authentication) ====================
async function openVoiceCall() {
    if (!isAuthenticated || !studentInfo) {
        showLoginModal();
        return;
    }
    
    const modal = document.getElementById('callModal');
    if (!modal) return;
    
    modal.classList.add('active');
    document.getElementById('callStatus').textContent = 'Requesting microphone access...';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        document.getElementById('callStatus').textContent = 'Connecting to support...';
        
        const callRequest = {
            studentId: studentInfo.userId,
            studentName: studentInfo.userName,
            studentEmail: studentInfo.userEmail,
            educationLevel: studentInfo.educationLevel || '',
            yearLevel: studentInfo.yearLevel || '',
            course: studentInfo.strandCourse || '',
            applicationStatus: studentInfo.applicationStatus || '',
            isEnrolled: studentInfo.isEnrolled || false,
            status: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        const newCallRef = callQueueRef.push();
        currentCallId = newCallRef.key;
        await newCallRef.set(callRequest);
        
        listenForCallConnection(currentCallId);
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        showToast('Could not access microphone. Please check permissions.', 'error');
        endVoiceCall();
    }
}

function listenForCallConnection(callId) {
    const callRef = callQueueRef.child(callId);
    
    callListener = callRef.on('value', async (snapshot) => {
        const call = snapshot.val();
        if (!call) return;
        
        if (call.status === 'connected' && call.offer) {
            document.getElementById('callStatus').textContent = `Connected with ${call.csrName || 'Support Agent'}`;
            startCallTimer();
            
            await createPeerConnection(callId);
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            await callRef.update({ answer: answer });
            
        } else if (call.status === 'ended') {
            endVoiceCall();
        } else if (call.status === 'waiting') {
            document.getElementById('callStatus').textContent = 'Waiting for available agent...';
        }
    });
}

async function createPeerConnection(callId) {
    peerConnection = new RTCPeerConnection(configuration);
    
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            callQueueRef.child(callId).child('iceCandidates').child('student').push({
                candidate: event.candidate.toJSON()
            });
        }
    };
    
    callQueueRef.child(callId).child('iceCandidates').child('csr').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data && data.candidate && peerConnection) {
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });
    
    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
            endVoiceCall();
        }
    };
    
    peerConnection.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(e => console.log('Audio play requires user interaction'));
    };
}

function startCallTimer() {
    callStartTime = Date.now();
    updateCallTimer();
    callTimerInterval = setInterval(updateCallTimer, 1000);
}

function updateCallTimer() {
    const timer = document.getElementById('callTimer');
    if (!timer || !callStartTime) return;
    
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toggleMute() {
    if (!localStream) return;
    
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });
    
    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
        muteBtn.classList.toggle('active', isMuted);
        muteBtn.innerHTML = isMuted 
            ? '<i class="fas fa-microphone-slash"></i>' 
            : '<i class="fas fa-microphone"></i>';
    }
}

function endVoiceCall() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (currentCallId) {
        callQueueRef.child(currentCallId).update({ status: 'ended' });
        if (callListener) {
            callQueueRef.child(currentCallId).off('value', callListener);
        }
        currentCallId = null;
    }
    
    const modal = document.getElementById('callModal');
    if (modal) modal.classList.remove('active');
    
    callStartTime = null;
    const callTimerElement = document.getElementById('callTimer');
    if (callTimerElement) callTimerElement.textContent = '00:00';
    const callStatusElement = document.getElementById('callStatus');
    if (callStatusElement) callStatusElement.textContent = 'Call ended';
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
    
    toast.addEventListener('click', () => toast.remove());
}

// ==================== CLEANUP ====================
window.addEventListener('beforeunload', () => {
    if (currentChatId) {
        chatQueueRef.child(currentChatId).update({ status: 'ended' });
    }
    if (currentCallId) {
        callQueueRef.child(currentCallId).update({ status: 'ended' });
    }
    endVoiceCall();
});
