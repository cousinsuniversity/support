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
    
    // Listen for auth state changes from school enrollment system
    schoolAuth.onAuthStateChanged((user) => {
        if (user) {
            currentSchoolUser = user;
            isAuthenticated = true;
            loadStudentDataFromSchool(user);
        } else {
            currentSchoolUser = null;
            isAuthenticated = false;
            studentInfo = null;
            updateAuthUI();
            displayUserInfo();
        }
    });
});

// ==================== AUTH UI UPDATE ====================
function updateAuthUI() {
    const liveChatBtn = document.getElementById('liveChatBtn');
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const contactSection = document.querySelector('.contact-support-section');
    
    if (isAuthenticated && studentInfo) {
        // Enable support buttons
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
        
        // Remove login prompt if exists
        const existingPrompt = document.getElementById('authRequiredPrompt');
        if (existingPrompt) {
            existingPrompt.remove();
        }
    } else {
        // Disable support buttons
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
        
        // Add login prompt if not already present
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
                <button id="loginRedirectBtn" style="
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
                    <i class="fas fa-sign-in-alt"></i> Go to School Portal Login
                </button>
            `;
            contactSection.appendChild(promptDiv);
            
            // Add login redirect handler
            document.getElementById('loginRedirectBtn').addEventListener('click', () => {
                // Redirect to school portal login page
                const schoolPortalUrl = window.location.origin + '/index.html'; // Adjust path as needed
                window.location.href = schoolPortalUrl + '?redirect=' + encodeURIComponent(window.location.href);
            });
        }
    }
}

// ==================== LOAD STUDENT DATA FROM SCHOOL ENROLLMENT SYSTEM ====================
async function loadStudentDataFromSchool(user) {
    try {
        // Get user data from school enrollment system
        const userSnapshot = await usersRef.child(user.uid).once('value');
        const userData = userSnapshot.val();
        
        // Get application data
        const appSnapshot = await applicationsRef.orderByChild('userId').equalTo(user.uid).once('value');
        let applicationData = null;
        
        if (appSnapshot.exists()) {
            appSnapshot.forEach(snap => {
                applicationData = snap.val();
            });
        }
        
        // Build student info from school enrollment data
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
        
        // Store in session
        sessionStorage.setItem('studentInfo', JSON.stringify(studentInfo));
        
        // Update UI
        updateAuthUI();
        displayUserInfo();
        
        // Update any active support requests
        updateSupportRequestData();
        
        console.log('Student data loaded from school enrollment system:', studentInfo);
        
    } catch (error) {
        console.error('Error loading student data from school:', error);
        // Don't fallback - user must be authenticated
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
            </div>
        `;
    } else {
        // Not authenticated - show login prompt
        userInfo.innerHTML = `
            <div class="user-avatar" style="background:#dc3545;">
                <i class="fas fa-user-lock"></i>
            </div>
            <div>
                <strong style="color:#dc3545;">Not Logged In</strong>
                <br><small>Please login to access support</small>
            </div>
        `;
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
    topicsRef.on('value', (snapshot) => {
        allTopics = [];
        const topics = snapshot.val() || {};
        
        Object.entries(topics).forEach(([key, value]) => {
            allTopics.push({
                id: key,
                ...value
            });
        });
        
        renderCategories();
        filterAndRenderTopics();
    });
}

function filterAndRenderTopics() {
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
    
    if (topics.length === 0) {
        topicsGrid.innerHTML = '';
        if (noTopics) noTopics.style.display = 'block';
        if (topicsTitle) topicsTitle.textContent = 'No Topics Found';
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
            <div class="topic-card" data-id="${topic.id}" onclick="toggleTopic(this, '${topic.id}')">
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
                <div class="topic-expanded">
                    <div class="topic-content">${topic.content || 'No detailed content available.'}</div>
                </div>
            </div>
        `;
    });
    
    topicsGrid.innerHTML = html;
}

window.toggleTopic = function(card, topicId) {
    const wasExpanded = card.classList.contains('expanded');
    
    document.querySelectorAll('.topic-card.expanded').forEach(c => c.classList.remove('expanded'));
    
    if (!wasExpanded) {
        card.classList.add('expanded');
        incrementViewCount(topicId);
    }
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
    // Check authentication first
    if (!isAuthenticated || !studentInfo) {
        showAuthRequiredModal('Live Chat');
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
    
    // Create chat request with school enrollment account info
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
    // Check authentication first
    if (!isAuthenticated || !studentInfo) {
        showAuthRequiredModal('Voice Call');
        return;
    }
    
    const modal = document.getElementById('callModal');
    if (!modal) return;
    
    modal.classList.add('active');
    document.getElementById('callStatus').textContent = 'Requesting microphone access...';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        document.getElementById('callStatus').textContent = 'Connecting to support...';
        
        // Create call request with school enrollment account info
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

// ==================== AUTH REQUIRED MODAL ====================
function showAuthRequiredModal(serviceType) {
    // Remove existing auth modal if any
    const existingModal = document.getElementById('authRequiredModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'authRequiredModal';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease;
    `;
    
    // Create modal content
    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 15px;
            padding: 30px;
            max-width: 450px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            animation: slideUp 0.3s ease;
        ">
            <div style="
                width: 70px;
                height: 70px;
                background: #fff3cd;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
            ">
                <i class="fas fa-lock" style="font-size: 30px; color: #e65100;"></i>
            </div>
            <h3 style="margin: 0 0 10px; color: #333; font-size: 20px;">Authentication Required</h3>
            <p style="color: #666; margin: 0 0 10px; line-height: 1.6;">
                You need to be logged into your <strong>Cousins University School Portal</strong> account to access <strong>${serviceType}</strong>.
            </p>
            <p style="color: #999; font-size: 13px; margin: 0 0 20px;">
                This ensures we can provide you with personalized support based on your enrollment status.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button id="goToLoginBtn" style="
                    background: #1a73e8;
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#1557b0'; this.style.transform='translateY(-2px)';" 
                   onmouseout="this.style.background='#1a73e8'; this.style.transform='translateY(0)';">
                    <i class="fas fa-sign-in-alt"></i> Go to Login
                </button>
                <button id="closeAuthModalBtn" style="
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 25px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#5a6268'; this.style.transform='translateY(-2px)';" 
                   onmouseout="this.style.background='#6c757d'; this.style.transform='translateY(0)';">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    document.getElementById('goToLoginBtn').addEventListener('click', () => {
        // Store current URL to redirect back after login
        sessionStorage.setItem('supportReturnUrl', window.location.href);
        // Redirect to school portal login
        const schoolPortalUrl = window.location.origin + '/index.html';
        window.location.href = schoolPortalUrl + '?redirect=' + encodeURIComponent(window.location.href);
    });
    
    document.getElementById('closeAuthModalBtn').addEventListener('click', () => {
        overlay.remove();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(50px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    if (!document.querySelector('style[data-auth-anim]')) {
        style.setAttribute('data-auth-anim', 'true');
        document.head.appendChild(style);
    }
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
