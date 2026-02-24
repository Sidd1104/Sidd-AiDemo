'use strict';
// ═══════════════════════════════════════════════════════════
//  SIDD-AI PLATFORM — Shared state, Bot CRUD, Nav, Utilities
// ═══════════════════════════════════════════════════════════

const API_BASE = window.location.protocol === 'file:'
    ? 'http://localhost:3001/api'
    : '/api';

// ─── Bot Store (localStorage) ────────────────────────────────
const BotStore = {
    _key: 'sidd-ai-bots',

    getAll() {
        try { return JSON.parse(localStorage.getItem(this._key) || '[]'); }
        catch { return []; }
    },

    get(id) {
        return this.getAll().find(b => b.id === id) || null;
    },

    save(bot) {
        const bots = this.getAll();
        const idx = bots.findIndex(b => b.id === bot.id);
        if (idx >= 0) { bots[idx] = { ...bots[idx], ...bot, updatedAt: Date.now() }; }
        else { bots.unshift({ ...bot, id: bot.id || crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }); }
        localStorage.setItem(this._key, JSON.stringify(bots));
        return bot;
    },

    delete(id) {
        const bots = this.getAll().filter(b => b.id !== id);
        localStorage.setItem(this._key, JSON.stringify(bots));
    },

    stats() {
        const bots = this.getAll();
        const channels = bots.reduce((n, b) => n + Object.keys(b.channels || {}).filter(c => (b.channels || {})[c]?.connected).length, 0);
        const msgs = bots.reduce((n, b) => n + (b.messageCount || 0), 0);
        return { bots: bots.length, channels, messages: msgs };
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

// ─── Nav Generation ─────────────────────────────────────────
function getActivePage() {
    const p = window.location.pathname.split('/').pop() || 'index.html';
    return p;
}

function renderNav() {
    const active = getActivePage();
    const token = localStorage.getItem('sidd-auth-token');
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('sidd-auth-user'));
    } catch (e) { }

    const links = [
        { href: 'dashboard.html', label: 'Dashboard' },
        { href: 'pricing.html', label: 'Pricing' },
        { href: 'marketplace.html', label: 'Marketplace' },
        { href: 'index.html', label: '🪙 $Sharp' },
    ];

    const navLinksHtml = links.map(l => `<a href="${l.href}" class="nav-link${active === l.href || (l.href === 'dashboard.html' && active === '') ? ' active' : ''}">${l.label}</a>`).join('');

    let navActionsHtml = '';
    if (token && user) {
        const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        navActionsHtml = `
            <div class="nav-user-profile" id="navUserProfile">
                <div class="nav-user-chip" onclick="toggleProfileDropdown()">
                    <div class="nav-user-avatar">${initials}</div>
                    <span class="nav-user-name">${user.name.split(' ')[0]}</span>
                    <svg class="nav-user-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
                <div class="nav-profile-dropdown" id="navProfileDropdown">
                    <div class="dropdown-header">
                        <div class="dropdown-user-info">
                            <div class="dropdown-user-name">${user.name}</div>
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
            <a href="builder.html" class="nav-btn nav-btn-primary nav-hide-mobile">Build Bot →</a>
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
          <span class="nav-logo-text">Sidd<span class="nav-logo-accent">-AI</span></span>
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
    if (el) el.innerHTML = renderNav();
}

function toggleMobileNav() {
    document.getElementById('navLinks')?.classList.toggle('open');
}

function toggleProfileDropdown() {
    const dd = document.getElementById('navProfileDropdown');
    const chip = document.querySelector('.nav-user-chip');
    if (dd) {
        const isOpen = dd.classList.toggle('open');
        chip.classList.toggle('active', isOpen);
    }
}

async function handleLogout() {
    const token = localStorage.getItem('sidd-auth-token');
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) { }
    localStorage.removeItem('sidd-auth-token');
    localStorage.removeItem('sidd-auth-user');
    showToast('Logged out successfully', 'info', '👋');
    setTimeout(() => window.location.href = 'login.html', 600);
}

// Close dropdown on click outside
document.addEventListener('click', (e) => {
    const dd = document.getElementById('navProfileDropdown');
    const chip = document.querySelector('.nav-user-chip');
    if (dd && dd.classList.contains('open')) {
        if (!dd.contains(e.target) && !chip.contains(e.target)) {
            dd.classList.remove('open');
            chip.classList.remove('active');
        }
    }
});

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
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 280);
    }, 3200);
}

// ─── Copy to clipboard ───────────────────────────────────────
function copyToClipboard(text, label = 'Copied!') {
    navigator.clipboard.writeText(text).then(() => {
        showToast(label, 'success', '📋');
    }).catch(() => {
        showToast('Failed to copy', 'error', '❌');
    });
}

// ─── Relative Time ───────────────────────────────────────────
function relativeTime(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

// ─── Channel labels / icons ──────────────────────────────────
const CHANNEL_META = {
    telegram: { label: 'Telegram', icon: '✈️', color: '#229ED9' },
    whatsapp: { label: 'WhatsApp', icon: '💬', color: '#25D366' },
    discord: { label: 'Discord', icon: '🎮', color: '#5865F2' },
    slack: { label: 'Slack', icon: '⚡', color: '#E01E5A' },
    webchat: { label: 'WebChat', icon: '🌐', color: '#6366f1' },
    signal: { label: 'Signal', icon: '🔒', color: '#3A76F0' },
};

// ─── Model options ───────────────────────────────────────────
const MODELS = [
    { name: 'GPT-4o', desc: 'OpenAI · Best quality', grad: 'linear-gradient(135deg,#10b981,#059669)', badge: 'PRO' },
    { name: 'Claude 3.5', desc: 'Anthropic · Long context', grad: 'linear-gradient(135deg,#f59e0b,#d97706)', badge: 'PRO' },
    { name: 'Gemini 1.5', desc: 'Google · Multimodal', grad: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', badge: 'PRO' },
    { name: 'Llama 3', desc: 'Meta · Fast & free', grad: 'linear-gradient(135deg,#ec4899,#8b5cf6)', badge: 'FREE' },
    { name: 'Mixtral', desc: 'Mistral · Efficient', grad: 'linear-gradient(135deg,#6366f1,#4f46e5)', badge: 'FREE' },
];

// ─── 3D Sky Canvas (red moon + shooting stars + parallax) ───
function initStarCanvas(canvasId = 'space-canvas') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    let points = [];
    const numPoints = 1200;
    const radius = 220;
    const fov = 400;
    let angleX = 0;
    let angleY = 0;
    let targetAngleX = 0;
    let targetAngleY = 0;

    class Point3D {
        constructor(i) {
            // Fibonacci Sphere Algorithm for beautiful even distribution
            const phi = Math.acos(-1 + (2 * i) / numPoints);
            const theta = Math.sqrt(numPoints * Math.PI) * phi;

            this.x = radius * Math.cos(theta) * Math.sin(phi);
            this.y = radius * Math.sin(theta) * Math.sin(phi);
            this.z = radius * Math.cos(phi);
        }

        rotate(ax, ay) {
            // Rotate around Y axis
            let cosY = Math.cos(ay), sinY = Math.sin(ay);
            let x1 = this.x * cosY - this.z * sinY;
            let z1 = this.x * sinY + this.z * cosY;

            // Rotate around X axis
            let cosX = Math.cos(ax), sinX = Math.sin(ax);
            let y1 = this.y * cosX - z1 * sinX;
            let z2 = this.y * sinX + z1 * cosX;

            this.x = x1;
            this.y = y1;
            this.z = z2;
        }

        draw() {
            // 3D to 2D Projection
            const scale = fov / (fov + this.z);
            const x2d = (this.x * scale) + W / 2;
            const y2d = (this.y * scale) + H / 2;

            // Depth styling — significantly boosted for maximum visibility
            const opacity = Math.max(0.25, (fov - this.z) / (fov * 1.2));
            const size = Math.max(1.0, scale * 2.4);

            // Solaris Colors: Solaris Gold (front) or Nova Crimson (back)
            const hue = this.z > -100 ? 45 : 340;
            const lum = this.z > 0 ? 80 : 60;
            ctx.fillStyle = `hsla(${hue}, 95%, ${lum}%, ${opacity})`;

            ctx.beginPath();
            ctx.arc(x2d, y2d, size, 0, Math.PI * 2);
            ctx.fill();

            // Premium Glow for foreground points
            if (this.z > 150) {
                ctx.shadowBlur = 12;
                ctx.shadowColor = `hsla(${hue}, 90%, 70%, ${opacity * 0.6})`;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }
    }

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    function createPoints() {
        points = [];
        for (let i = 0; i < numPoints; i++) {
            points.push(new Point3D(i));
        }
    }

    function animate() {
        ctx.clearRect(0, 0, W, H);

        // Background Glow
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, radius * 1.8);
        grad.addColorStop(0, 'rgba(250, 204, 21, 0.04)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Smoothly interpolate rotation
        angleX += (targetAngleX - angleX) * 0.05;
        angleY += (targetAngleY - angleY) * 0.05;

        // Constant slow drift
        const autoX = 0.001;
        const autoY = 0.0015;

        // Sort points by Z to handle simple occlusion
        points.sort((a, b) => b.z - a.z);

        for (let p of points) {
            p.rotate(autoX + angleX, autoY + angleY);
            p.draw();
        }

        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
        resize();
        createPoints();
    });

    window.addEventListener('mousemove', (e) => {
        targetAngleY = (e.clientX - W / 2) * 0.00002;
        targetAngleX = (e.clientY - H / 2) * 0.00002;
    });

    resize();
    createPoints();
    animate();
}

// ─── Auto init on load ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    injectNav();
    initStarCanvas();
});
