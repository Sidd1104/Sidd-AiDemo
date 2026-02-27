import { auth, db } from './firebase.js';
import {
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const API_BASE = window.location.protocol === 'file:'
    ? 'http://localhost:3001/api'
    : '/api';

// ─── Bot Store (Firestore) ───────────────────────────────────
const BotStore = {
    async getAll() {
        if (!auth.currentUser) return [];
        try {
            const q = query(
                collection(db, 'bots'),
                where('userId', '==', auth.currentUser.uid),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
        } catch (e) {
            console.error('[BotStore] getAll failed:', e);
            return [];
        }
    },

    async get(id) {
        try {
            const docRef = doc(db, 'bots', id);
            const snap = await getDoc(docRef);
            return snap.exists() ? { ...snap.data(), id: snap.id } : null;
        } catch (e) { return null; }
    },

    async save(bot) {
        if (!auth.currentUser) throw new Error('Not authenticated');
        const id = bot.id || crypto.randomUUID();
        const docRef = doc(db, 'bots', id);

        // Ensure required fields
        const data = {
            ...bot,
            id,
            userId: auth.currentUser.uid,
            updatedAt: Date.now(),
            createdAt: bot.createdAt || Date.now(),
            messageCount: bot.messageCount || 0,
            active: bot.active !== undefined ? bot.active : true,
            channels: bot.channels || {}
        };

        await setDoc(docRef, data, { merge: true });
        return data;
    },

    async delete(id) {
        if (!auth.currentUser) return;
        await deleteDoc(doc(db, 'bots', id));
    },

    async stats() {
        const bots = await this.getAll();
        const channels = bots.reduce((n, b) => n + Object.keys(b.channels || {}).filter(c => b.channels[c]?.connected).length, 0);
        const msgs = bots.reduce((n, b) => n + (b.messageCount || 0), 0);
        return { bots: bots.length, channels, messages: msgs };
    }
};

// ─── Firebase Reliability Test Suite ──────────────────────────
const SharpDBTest = {
    async runAll() {
        console.log('🚀 Starting Sharp AI Database Integration Tests...');
        try {
            if (!auth.currentUser) throw new Error('Not authenticated. Please log in first.');

            // 1. User Sync Test
            console.log('⏳ Testing UserStore.sync...');
            const profile = await UserStore.sync(auth.currentUser);
            if (!profile.uid) throw new Error('User sync failed');
            console.log('✅ UserStore: PASS');

            // 2. Bot Persistence Test
            console.log('⏳ Testing BotStore.save...');
            const testBot = await BotStore.save({
                name: '🔥 Test Bot ' + Date.now(),
                emoji: '🤖',
                systemPrompt: 'Test connectivity',
                isTest: true
            });
            console.log('✅ BotStore Save: PASS');

            // 3. Bot Retrieval Test
            console.log('⏳ Testing BotStore.getAll...');
            const all = await BotStore.getAll();
            if (!all.find(b => b.id === testBot.id)) throw new Error('Bot retrieval failed');
            console.log('✅ BotStore Retrieval: PASS');

            // 4. Cleanup
            console.log('⏳ Cleaning up...');
            await BotStore.delete(testBot.id);
            console.log('✅ Cleanup: PASS');

            console.log('🎉 ALL DATABASE TESTS PASSED! Sharp AI DB is sync-ready.');
            return true;
        } catch (e) {
            console.error('❌ DATABASE TEST FAILED:', e.message);
            return false;
        }
    }
};

// ─── User Store (Firestore) ──────────────────────────────────
const UserStore = {
    async sync(user) {
        if (!user) return null;
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        const userData = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || (user.email ? user.email.split('@')[0] : (user.phoneNumber || 'User')),
            photoURL: user.photoURL || '',
            lastLogin: Date.now(),
            updatedAt: Date.now()
        };

        if (!snap.exists()) {
            // New user defaults
            userData.createdAt = Date.now();
            userData.credits = 100;
            userData.plan = 'free';
            userData.bio = '';
            await setDoc(userRef, userData);
        } else {
            // Update existing
            await setDoc(userRef, {
                lastLogin: userData.lastLogin,
                updatedAt: userData.updatedAt
            }, { merge: true });
        }
        return snap.exists() ? { ...snap.data(), ...userData } : userData;
    },

    async get(uid) {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? snap.data() : null;
    }
};

// ─── Marketplace Templates ───────────────────────────────────
const MARKETPLACE_TEMPLATES = [
    { id: 't1', name: 'Customer Support Bot', emoji: '🎧', category: 'support', model: 'GPT-4o', installs: 12840, price: 0, description: 'Handles FAQs, escalates complex issues, tracks tickets.', system: 'You are a friendly and professional customer support agent. Always greet the user, identify their issue clearly, and provide step-by-step solutions. If you cannot resolve the issue, offer to escalate to a human agent.' },
    { id: 't2', name: 'Sales Assistant', emoji: '💼', category: 'sales', model: 'Claude 3.5', installs: 9200, price: 0, description: 'Qualifies leads, books demos, answers product questions.', system: 'You are an enthusiastic sales assistant. Your goal is to understand the customer\'s needs, match them with the right product or service, and guide them toward booking a demo or making a purchase. Be persuasive but never pushy.' },
    { id: 't3', name: 'Code Helper', emoji: '💻', category: 'developer', model: 'GPT-4o', installs: 22100, price: 0, description: 'Debugs code, explains concepts, writes clean functions.', system: 'You are an expert software engineer. Help users debug code, explain programming concepts clearly, and write clean, well-commented code. Always ask for the programming language if not specified. Provide working examples.' },
    { id: 't4', name: 'Language Teacher', emoji: '🌍', category: 'education', model: 'Gemini 1.5', installs: 7400, price: 0, description: 'Teaches vocabulary, grammar, and conversation practice.', system: 'You are a patient and encouraging language teacher. Teach vocabulary, correct grammar gently, and practice conversation with the student. Adapt your teaching style to the student\'s level. Make lessons fun and engaging.' },
    { id: 't5', name: 'Recipe Bot', emoji: '👨‍🍳', category: 'entertainment', model: 'Llama 3', installs: 5800, price: 0, description: 'Suggests recipes based on ingredients you have.', system: 'You are a creative chef bot. Suggest delicious recipes based on the ingredients the user provides. Include step-by-step instructions, cooking times, and tips for best results. Always ask about dietary restrictions first.' },
    { id: 't6', name: 'Fitness Coach', emoji: '💪', category: 'health', model: 'GPT-4o', installs: 8900, price: 0, description: 'Creates workout plans, tracks progress, motivates.', system: 'You are an enthusiastic personal fitness coach. Create personalized workout plans, provide nutritional guidance, and keep users motivated. Always consider the user\'s fitness level, goals, and any physical limitations.' },
    { id: 't7', name: 'FAQ Bot', emoji: '❓', category: 'support', model: 'Llama 3', installs: 18000, price: 0, description: 'Instantly answers common questions with your custom FAQ.', system: 'You are an FAQ assistant. Answer common questions clearly and concisely. If a question is outside your knowledge base, politely say so and offer to connect the user with a human.' },
    { id: 't8', name: 'News Summarizer', emoji: '📰', category: 'entertainment', model: 'Claude 3.5', installs: 4200, price: 0, description: 'Summarizes news topics in bullet points.', system: 'You are a news analyst. Summarize news stories clearly and objectively in 3-5 bullet points. Cover the key facts: who, what, when, where, why. Avoid bias and present multiple perspectives when relevant.' },
    { id: 't9', name: 'GitHub Issues Bot', emoji: '🐙', category: 'developer', model: 'GPT-4o', installs: 3100, price: 0, description: 'Helps triage GitHub issues, suggests labels and solutions.', system: 'You are a GitHub project manager bot. Help triage issues by asking clarifying questions, suggesting appropriate labels, estimating priority, and recommending potential solutions or workarounds based on the issue description.' },
    { id: 't10', name: 'Crypto Analyst', emoji: '📊', category: 'finance', model: 'Gemini 1.5', installs: 6700, price: 0, description: 'Explains crypto concepts, analyzes market trends.', system: 'You are a knowledgeable cryptocurrency analyst. Explain blockchain concepts, analyze market trends based on historical data, and discuss different cryptocurrencies objectively. Always remind users that this is not financial advice.' },
];

function getActivePage() {
    const p = window.location.pathname.split('/').pop() || 'index.html';
    return p;
}

function renderNav() {
    const active = getActivePage();
    const user = auth.currentUser;

    const links = [
        { href: 'dashboard.html', label: 'Dashboard' },
        { href: 'pricing.html', label: 'Pricing' },
        { href: 'marketplace.html', label: 'Marketplace' },
        { href: 'index.html', label: '$Sharp', isPill: true },
    ];

    const navLinksHtml = links.map(l => {
        const isActive = active === l.href || (l.href === 'dashboard.html' && (active === '' || active === 'platform.html' || active === 'builder.html' || active === 'channels.html'));
        if (l.isPill) {
            return `<a href="${l.href}" class="nav-pill${isActive ? ' active' : ''}"><span class="nav-dot"></span>${l.label}</a>`;
        }
        return `<a href="${l.href}" class="nav-link${isActive ? ' active' : ''}">${l.label}</a>`;
    }).join('');

    let navActionsHtml = '';
    if (user) {
        const name = user.displayName || user.email.split('@')[0];
        const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        navActionsHtml = `
            <div class="nav-actions-group">
                <div class="nav-user-profile" id="navUserProfile">
                    <div class="nav-user-chip" onclick="toggleProfileDropdown()">
                        <div class="nav-user-avatar">${initials}</div>
                        <span class="nav-user-name">${name.split(' ')[0]}</span>
                        <svg class="nav-user-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="nav-profile-dropdown" id="navProfileDropdown">
                        <div class="dropdown-header">
                            <div class="dropdown-user-info">
                                <div class="dropdown-user-name">${name}</div>
                                <div class="dropdown-user-email">${user.email}</div>
                            </div>
                        </div>
                        <div class="dropdown-divider"></div>
                        <a href="dashboard.html?tab=profile" class="dropdown-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            Profile Settings
                        </a>
                        <a href="dashboard.html" class="dropdown-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                            My Bots
                        </a>
                        <div class="dropdown-divider"></div>
                        <button class="dropdown-item logout" onclick="handleLogout()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            Logout
                        </button>
                    </div>
                </div>
                <a href="builder.html" class="nav-btn nav-btn-primary nav-hide-mobile">Start Building →</a>
            </div>
        `;
    } else {
        navActionsHtml = `
            <a href="login.html" class="nav-btn nav-btn-ghost">Login</a>
            <a href="builder.html" class="nav-btn nav-btn-primary">Start Building →</a>
        `;
    }

    return `
    <nav class="platform-nav" id="platNav">
      <div class="nav-brand">
        <a href="index.html" class="nav-logo-link">
          <div class="nav-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                fill="url(#navGrad)" stroke="none"/>
              <defs><linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#f43f5e"/>
              </linearGradient></defs>
            </svg>
          </div>
          <span class="nav-logo-text">Sharp<span class="nav-logo-accent"> AI</span></span>
        </a>
      </div>
      <div class="nav-links" id="navLinks">
        ${navLinksHtml}
      </div>
      <div class="nav-actions">
        ${navActionsHtml}
        <button class="nav-hamburger" onclick="toggleMobileNav()" id="hamburger">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>`;
}

function injectNav() {
    const el = document.getElementById('platformNav');
    if (!el) return;

    el.innerHTML = renderNav();

    // Premium scroll effect
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('platNav');
        if (!nav) return;
        if (window.scrollY > 20) {
            nav.style.background = 'rgba(1, 1, 3, 0.98)';
            nav.style.height = '64px';
            nav.style.borderBottomColor = 'rgba(250, 204, 21, 0.25)';
        } else {
            nav.style.background = 'rgba(1, 1, 3, 0.94)';
            nav.style.height = '72px';
            nav.style.borderBottomColor = 'rgba(250, 204, 21, 0.12)';
        }
    });
}

function toggleMobileNav() {
    document.getElementById('navLinks')?.classList.toggle('open');
}

function toggleProfileDropdown() {
    const dd = document.getElementById('navProfileDropdown');
    const chip = document.querySelector('.nav-user-chip');
    if (dd) {
        const isOpen = dd.classList.toggle('open');
        chip?.classList.toggle('active', isOpen);
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (e) {
        showToast('Logout failed', 'error', '❌');
    }
}

// ─── Toast (shared) ──────────────────────────────────────────
function showToast(msg, type = 'info', icon = 'ℹ️') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function copyToClipboard(text, msg = 'Copied!') {
    navigator.clipboard.writeText(text).then(() => showToast(msg, 'success', '📋'));
}

function relativeTime(date) {
    if (!date) return '...';
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return new Date(date).toLocaleDateString();
}

const MODEL_OPTIONS = [
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', provider: 'OpenAI', icon: '⚡' },
    { id: 'claude-3-5', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', icon: '🎭' },
    { id: 'gemini-1-5', name: 'Gemini 1.5 Pro', provider: 'Google', icon: '♊' },
    { id: 'llama-3', name: 'Llama 3 (70B)', provider: 'Groq', icon: '🦙' }
];

function getChannelMeta(id) {
    const metas = {
        'web': { name: 'Web Widget', icon: '🌐', color: '#6366f1' },
        'whatsapp': { name: 'WhatsApp', icon: '💬', color: '#25d366' },
        'telegram': { name: 'Telegram', icon: '✈️', color: '#0088cc' },
        'discord': { name: 'Discord', icon: '👾', color: '#5865f2' }
    };
    return metas[id] || { name: id, icon: '🔌', color: '#94a3b8' };
}

// Global Exports
window.BotStore = BotStore;
window.MARKETPLACE_TEMPLATES = MARKETPLACE_TEMPLATES;
window.renderNav = renderNav;
window.injectNav = injectNav;
window.toggleMobileNav = toggleMobileNav;
window.toggleProfileDropdown = toggleProfileDropdown;
window.handleLogout = handleLogout;
window.showToast = showToast;
window.copyToClipboard = copyToClipboard;
window.relativeTime = relativeTime;
window.getChannelMeta = getChannelMeta;
window.BotStore = BotStore;
window.UserStore = UserStore;
window.SharpDBTest = SharpDBTest;

// Init
injectNav();

onAuthStateChanged(auth, async (user) => {
    if (user) {
        await UserStore.sync(user);
    }
    injectNav();
});

// Close dropdown on click outside
document.addEventListener('click', (e) => {
    const dd = document.getElementById('navProfileDropdown');
    const chip = document.querySelector('.nav-user-chip');
    if (dd && dd.classList.contains('open')) {
        if (!dd.contains(e.target) && !chip?.contains(e.target)) {
            dd.classList.remove('open');
            chip?.classList.remove('active');
        }
    }
});
