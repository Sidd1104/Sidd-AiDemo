'use strict';

// ── Config ────────────────────────────────────
const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:3001/api'
  : '/api';

// ── State ─────────────────────────────────────
let sessionId = null;
let currentModel = 'Llama 3';
let currentGrad = 'linear-gradient(135deg,#ec4899,#8b5cf6)';
let isStreaming = false;
let streamCtrl = null;
let messageCount = 0;
let walletAddress = null;
let chatHistory = [];            // [{role, content}]
let customSystemPrompt = '';        // user-editable system prompt
let attachedFile = null;          // { name, content, type }
let isRecording = false;
let recognition = null;

// Load persisted system prompt
(function loadSystemPrompt() {
  customSystemPrompt = localStorage.getItem('sidd-system-prompt') || '';
})();

// ─────────────────────────────────────────────
// SPACE CANVAS — Stars + Shooting Stars + Moon parallax
// ─────────────────────────────────────────────
(function initSpaceCanvas() {
  const canvas = document.getElementById('space-canvas');
  const ctx = canvas.getContext('2d');
  const moon = document.getElementById('moon');

  let stars = [];
  let shoots = [];
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    buildStars();
  }

  function buildStars() {
    stars = [];
    const n = Math.floor((W * H) / 4200);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        alpha: Math.random() * 0.7 + 0.2,
        twinkleSpeed: Math.random() * 0.015 + 0.003,
        twinkleDir: Math.random() > 0.5 ? 1 : -1,
        hue: Math.random() < 0.15 ? `hsl(${Math.random() * 60 + 220},80%,85%)` : '#ffffff',
      });
    }
  }

  function spawnShoot() {
    const startX = Math.random() * W * 0.8;
    const startY = Math.random() * H * 0.4;
    const angle = (Math.random() * 25 + 20) * (Math.PI / 180);
    const speed = Math.random() * 10 + 8;
    const len = Math.random() * 180 + 100;
    shoots.push({
      x: startX, y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len, life: 1, decay: Math.random() * 0.025 + 0.015,
      thickness: Math.random() * 1.5 + 0.5,
    });
  }

  function scheduleShoots() {
    const delay = Math.random() * 2800 + 600;
    setTimeout(() => {
      if (Math.random() > 0.3) spawnShoot();
      if (Math.random() > 0.7) spawnShoot();
      scheduleShoots();
    }, delay);
  }

  let mouseX = window.innerWidth * 0.5;
  let mouseY = window.innerHeight * 0.5;
  window.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    if (moon) {
      const dx = (e.clientX / W - 0.5) * 18;
      const dy = (e.clientY / H - 0.5) * 12;
      moon.style.transform = `translate(${-dx}px, ${-dy}px)`;
    }
  });

  function draw() {
    ctx.clearRect(0, 0, W, H);
    stars.forEach(s => {
      s.alpha += s.twinkleSpeed * s.twinkleDir;
      if (s.alpha >= 0.9 || s.alpha <= 0.1) s.twinkleDir *= -1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.hue;
      ctx.globalAlpha = s.alpha;
      ctx.fill();
    });

    shoots = shoots.filter(s => s.life > 0);
    shoots.forEach(s => {
      s.x += s.vx; s.y += s.vy; s.life -= s.decay;
      const tailX = s.x - s.vx * (s.len / 12);
      const tailY = s.y - s.vy * (s.len / 12);
      const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
      grad.addColorStop(0, `rgba(255,255,255,0)`);
      grad.addColorStop(0.6, `rgba(180,160,255,${s.life * 0.8})`);
      grad.addColorStop(1, `rgba(255,255,255,${s.life})`);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = s.life;
      ctx.lineWidth = s.thickness;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.thickness * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.life * 0.9})`;
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  scheduleShoots();
  draw();
})();

// ─────────────────────────────────────────────
// SERVER HEALTH CHECK
// ─────────────────────────────────────────────
async function checkServerHealth() {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.status === 'ok') {
      dot.className = 'status-dot online';
      text.textContent = 'Live';
    }
  } catch {
    dot.className = 'status-dot demo';
    text.textContent = 'Demo mode';
  }
}

// ─────────────────────────────────────────────
// SESSION MANAGEMENT
// ─────────────────────────────────────────────
async function createSession() {
  try {
    const res = await fetch(`${API_BASE}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel }) });
    const data = await res.json();
    sessionId = data.sessionId || data.id || crypto.randomUUID();
  } catch {
    sessionId = crypto.randomUUID();
  }
}

// ─────────────────────────────────────────────
// MODEL SELECTOR
// ─────────────────────────────────────────────
function toggleModelDropdown() {
  const dd = document.getElementById('modelDropdown');
  const chevron = document.getElementById('modelChevron');
  const open = dd.classList.toggle('open');
  chevron.classList.toggle('open', open);
}

function selectModel(name, gradient) {
  currentModel = name; currentGrad = gradient;
  document.getElementById('currentModelName').textContent = name;
  document.getElementById('navModelName').textContent = name;
  document.getElementById('modelIndicator').style.background = gradient;
  document.getElementById('navModelDot').style.background = gradient;
  document.querySelectorAll('.model-option').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');
  closeModelDropdown();
  showToast(`Model switched to ${name}`, 'info', '🤖');
}

function closeModelDropdown() {
  document.getElementById('modelDropdown').classList.remove('open');
  document.getElementById('modelChevron').classList.remove('open');
}

// ─────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  localStorage.setItem('sidd-theme', next);
  showToast(`Switched to ${next} mode`, 'info', next === 'dark' ? '🌙' : '☀️');
}
(function applyStoredTheme() {
  const saved = localStorage.getItem('sidd-theme');
  if (saved) document.documentElement.dataset.theme = saved;
})();

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
let sidebarOpen = true;

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 820) {
    sidebar.classList.toggle('mobile-open');
  } else {
    sidebarOpen = !sidebarOpen;
    sidebar.classList.toggle('collapsed', !sidebarOpen);
  }
}

document.getElementById('closeSidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('mobile-open');
});

document.addEventListener('click', e => {
  if (window.innerWidth <= 820) {
    const sidebar = document.getElementById('sidebar');
    const isInside = sidebar.contains(e.target) || document.getElementById('topNav').contains(e.target);
    if (!isInside && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
    }
  }
});

// ─────────────────────────────────────────────
// CHAT SEARCH
// ─────────────────────────────────────────────
function filterHistory(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll('#historyList .history-item');
  items.forEach(item => {
    const text = item.querySelector('.history-text')?.textContent?.toLowerCase() || '';
    item.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
}

// ─────────────────────────────────────────────
// CHAT INPUT
// ─────────────────────────────────────────────
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
  const n = chatInput.value.length;
  charCount.textContent = `${n} / 10000`;
  charCount.style.color = n > 9000 ? '#f87171' : '';
  sendBtn.disabled = n === 0 || isStreaming;
});

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault(); chatInput.focus();
  }
  if (e.key === 'Escape') {
    closeAllModals(); closeModelDropdown();
    document.getElementById('settingsPanel')?.classList.remove('open');
  }
});

// ─────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────
function attachFile() {
  const input = document.getElementById('fileInput');
  if (input) input.click();
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const MAX = 1024 * 1024 * 5; // 5 MB
  if (file.size > MAX) {
    showToast('File too large (max 5 MB)', 'error', '❌');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  const isImage = file.type.startsWith('image/');

  if (isImage) {
    reader.onload = () => {
      attachedFile = { name: file.name, content: reader.result, type: 'image' };
      showAttachedFilePill(file.name, '🖼️');
      showToast(`Image attached: ${file.name}`, 'success', '🖼️');
    };
    reader.readAsDataURL(file);
  } else {
    reader.onload = () => {
      attachedFile = { name: file.name, content: reader.result, type: 'text' };
      showAttachedFilePill(file.name, '📄');
      showToast(`File attached: ${file.name}`, 'success', '📄');
    };
    reader.readAsText(file);
  }
  input.value = '';
}

function showAttachedFilePill(name, icon) {
  // Remove existing pill
  document.getElementById('attachedFilePill')?.remove();

  const pill = document.createElement('div');
  pill.id = 'attachedFilePill';
  pill.className = 'attached-file-pill';
  pill.innerHTML = `
    <span>${icon} ${name.length > 25 ? name.slice(0, 22) + '…' : name}</span>
    <button onclick="removeAttachedFile()" title="Remove file">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>`;
  document.querySelector('.input-wrapper').insertBefore(pill, document.querySelector('.input-box'));
}

function removeAttachedFile() {
  attachedFile = null;
  document.getElementById('attachedFilePill')?.remove();
}

// ─────────────────────────────────────────────
// VOICE INPUT
// ─────────────────────────────────────────────
function toggleVoiceInput() {
  const micBtn = document.getElementById('micBtn');
  if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
    showToast('Voice input not supported in this browser', 'error', '🎤');
    return;
  }

  if (isRecording) {
    recognition?.stop();
    return;
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRec();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    isRecording = true;
    micBtn?.classList.add('recording');
    showToast('Listening… speak now', 'info', '🎤');
  };

  recognition.onresult = e => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    chatInput.value = transcript;
    chatInput.dispatchEvent(new Event('input'));
  };

  recognition.onerror = err => {
    showToast(`Voice error: ${err.error}`, 'error', '⚠️');
    isRecording = false;
    micBtn?.classList.remove('recording');
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn?.classList.remove('recording');
  };

  recognition.start();
}

// ─────────────────────────────────────────────
// IMAGE GENERATION
// ─────────────────────────────────────────────
async function generateImageFromPrompt() {
  const prompt = chatInput.value.trim() || '';
  if (!prompt) {
    // Show a quick prompt dialog
    const p = window.prompt('Enter image prompt:', '');
    if (!p) return;
    chatInput.value = p;
    chatInput.dispatchEvent(new Event('input'));
  }
  // Prefix with /image so sendMessage handles it
  const txt = chatInput.value.trim();
  chatInput.value = txt.startsWith('/image') ? txt : `/image ${txt}`;
  chatInput.dispatchEvent(new Event('input'));
  sendMessage();
}

async function handleImageGeneration(prompt) {
  appendMessage('user', `/image ${prompt}`);
  showMessagesArea();
  const typingId = showTyping();
  setStreaming(true);

  try {
    // Try server endpoint first
    const res = await fetch(`${API_BASE}/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(30000),
    });

    removeTyping(typingId);

    if (res.ok) {
      const data = await res.json();
      const imgUrl = data.url || data.imageUrl;
      appendImageMessage(imgUrl, prompt);
    } else {
      throw new Error('Server image gen failed');
    }
  } catch {
    removeTyping(typingId);
    // Fallback: Pollinations.ai (free, no key needed)
    const encoded = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 9999999);
    const imgUrl = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&seed=${seed}&nologo=true`;
    appendImageMessage(imgUrl, prompt);
  } finally {
    setStreaming(false);
    scrollToBottom();
  }
}

function appendImageMessage(imgUrl, prompt) {
  const area = document.getElementById('messagesInner');
  const div = document.createElement('div');
  div.className = 'msg ai';
  messageCount++;

  const svgAvatar = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
      fill="url(#imgGrad)" stroke="none"/>
    <defs><linearGradient id="imgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a5b4fc"/><stop offset="100%" stop-color="#e879f9"/>
    </linearGradient></defs></svg>`;

  div.innerHTML = `
    <div class="msg-avatar">${svgAvatar}</div>
    <div class="msg-content">
      <div class="msg-bubble img-bubble">
        <div class="img-gen-label">🎨 Generated Image</div>
        <div class="img-gen-prompt">"${escHtml(prompt)}"</div>
        <div class="img-gen-wrap">
          <img src="${imgUrl}" alt="${escHtml(prompt)}" class="gen-img" onerror="this.src=''; this.parentElement.innerHTML='<div class=\\'img-error\\'>❌ Image failed to load. Try again.</div>'" onload="this.style.opacity=1;scrollToBottom();" style="opacity:0;transition:opacity .4s">
        </div>
        <div class="img-actions">
          <a href="${imgUrl}" target="_blank" class="msg-action-btn">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg> Open Full
          </a>
          <button class="msg-action-btn" onclick="downloadImage('${imgUrl}', '${escHtml(prompt).replace(/'/g, "\\'")}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg> Download
          </button>
        </div>
      </div>
      <div class="msg-time">${getTime()}</div>
    </div>`;
  area.appendChild(div);
  scrollToBottom();
  chatHistory.push({ role: 'assistant', content: `[Generated image for: ${prompt}]` });
}

function downloadImage(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = (name || 'sidd-ai-image') + '.png';
  a.target = '_blank';
  a.click();
  showToast('Downloading image…', 'info', '⬇️');
}

// ─────────────────────────────────────────────
// SEND MESSAGE
// ─────────────────────────────────────────────
async function sendMessage() {
  let text = chatInput.value.trim();
  if (!text || isStreaming) return;

  // Check for /image command
  if (text.startsWith('/image ')) {
    const imgPrompt = text.slice(7).trim();
    chatInput.value = '';
    chatInput.style.height = 'auto';
    charCount.textContent = '0 / 10000';
    sendBtn.disabled = true;
    addToHistorySidebar(`🎨 ${imgPrompt}`);
    await handleImageGeneration(imgPrompt);
    return;
  }

  // Prepend attached file content
  let fullMessage = text;
  if (attachedFile) {
    if (attachedFile.type === 'text') {
      fullMessage = `[File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content.slice(0, 8000)}\n\`\`\`\n\n${text}`;
    } else if (attachedFile.type === 'image') {
      fullMessage = `[Image attached: ${attachedFile.name}]\n${text}`;
    }
    removeAttachedFile();
  }

  if (!sessionId) await createSession();

  showMessagesArea();
  appendMessage('user', fullMessage === text ? text : `📎 ${attachedFile?.name ? '' : ''}${text}`);
  chatHistory.push({ role: 'user', content: fullMessage });

  chatInput.value = '';
  chatInput.style.height = 'auto';
  charCount.textContent = '0 / 10000';
  sendBtn.disabled = true;

  addToHistorySidebar(text);

  const typingId = showTyping();
  setStreaming(true);

  try {
    streamCtrl = new AbortController();
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullMessage,
        model: currentModel,
        sessionId,
        systemPrompt: customSystemPrompt || undefined,
      }),
      signal: streamCtrl.signal,
    });

    removeTyping(typingId);

    if (!res.ok) throw new Error(`Server error ${res.status}`);

    if (res.headers.get('content-type')?.includes('text/event-stream')) {
      await streamSSE(res);
    } else {
      const data = await res.json();
      appendMessage('ai', data.response || data.message || 'No response.');
    }
  } catch (err) {
    removeTyping(typingId);
    if (err.name !== 'AbortError') {
      const demoReply = getDemoReply(text);
      await typeMessage(demoReply);
    }
  } finally {
    setStreaming(false);
    scrollToBottom();
  }
}

async function streamSSE(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const msgEl = appendMessage('ai', '');
  const bubble = msgEl.querySelector('.msg-bubble');
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (raw === '[DONE]') return;
      try {
        const obj = JSON.parse(raw);
        const token = obj.choices?.[0]?.delta?.content
          || obj.token || obj.text || obj.content || '';
        if (token) {
          full += token;
          bubble.innerHTML = formatMessage(full);
          scrollToBottom();
        }
      } catch { }
    }
  }
  chatHistory.push({ role: 'assistant', content: full });
}

async function typeMessage(text) {
  const msgEl = appendMessage('ai', '');
  const bubble = msgEl.querySelector('.msg-bubble');
  let built = '';
  for (let i = 0; i < text.length; i++) {
    built += text[i];
    bubble.innerHTML = formatMessage(built);
    scrollToBottom();
    if (streamCtrl?.signal.aborted) break;
    await new Promise(r => setTimeout(r, 12));
  }
  chatHistory.push({ role: 'assistant', content: text });
}

function setStreaming(on) {
  isStreaming = on;
  sendBtn.disabled = on;
  document.getElementById('stopBtn').style.display = on ? 'flex' : 'none';
}

function stopGeneration() {
  if (streamCtrl) { streamCtrl.abort(); streamCtrl = null; }
  setStreaming(false);
  showToast('Generation stopped', 'info', '⏹️');
}

// ─────────────────────────────────────────────
// ENHANCED MESSAGE RENDERING
// ─────────────────────────────────────────────
function appendMessage(role, text) {
  const area = document.getElementById('messagesInner');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  messageCount++;

  const avatarContent = role === 'user'
    ? 'S'
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
          fill="url(#aGrad)" stroke="none"/>
        <defs><linearGradient id="aGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#a5b4fc"/><stop offset="100%" stop-color="#e879f9"/>
        </linearGradient></defs></svg>`;

  const msgId = `msg-${Date.now()}-${messageCount}`;

  div.innerHTML = `
    <div class="msg-avatar">${avatarContent}</div>
    <div class="msg-content">
      <div class="msg-bubble" id="${msgId}">${formatMessage(text)}</div>
      <div class="msg-time">${getTime()}</div>
      <div class="msg-actions">
        <button class="msg-action-btn" onclick="copyMessage(this)" title="Copy">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg> Copy
        </button>
        ${role === 'ai' ? `
        <button class="msg-action-btn" onclick="regenerate()">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg> Retry
        </button>
        <button class="msg-action-btn reaction-btn" onclick="reactMessage(this,'👍')" title="Good response" data-reaction="">
          👍
        </button>
        <button class="msg-action-btn reaction-btn" onclick="reactMessage(this,'👎')" title="Bad response" data-reaction="">
          👎
        </button>` : ''}
      </div>
    </div>`;

  area.appendChild(div);
  scrollToBottom();
  return div;
}

// ─────────────────────────────────────────────
// MARKDOWN / FORMAT
// ─────────────────────────────────────────────
function formatMessage(text) {
  if (!text) return '';

  // Fenced code blocks (``` lang ```)
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang || 'text';
    const id = 'code-' + Math.random().toString(36).slice(2, 8);
    return `<div class="code-block">
      <div class="code-header">
        <span class="code-lang">${escHtml(langLabel)}</span>
        <button class="code-copy-btn" onclick="copyCode('${id}')" id="btn-${id}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg> Copy
        </button>
      </div>
      <pre><code class="lang-${escHtml(langLabel)}" id="${id}">${escHtml(code.trim())}</code></pre>
    </div>`;
  });

  // Inline code
  text = text.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Headings
  text = text.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Bold + italic
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // Underscore bold/italic
  text = text.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');

  // Strikethrough
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Horizontal rule
  text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr class="md-hr">');

  // Blockquote
  text = text.replace(/^&gt; (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');
  text = text.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

  // Tables (GFM)
  text = text.replace(/((?:\|.+\|\n?)+)/g, (match) => {
    const rows = match.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return match;
    const headerCells = rows[0].split('|').filter((c, i, a) => i > 0 && i < a.length - 1).map(c => `<th>${c.trim()}</th>`).join('');
    const bodyRows = rows.slice(2).map(r => {
      const cells = r.split('|').filter((c, i, a) => i > 0 && i < a.length - 1).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Unordered lists (- or * or +)
  text = text.replace(/^[*\-+] (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)+/gs, m => `<ul class="md-ul">${m}</ul>`);

  // Ordered lists (1. 2. etc)
  text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // avoid double-wrapping
  text = text.replace(/(<li>.*<\/li>)+(?!<\/[uo]l>)/gs, m => {
    if (m.match(/^<li>\d/)) return m; // crude skip
    return `<ol class="md-ol">${m}</ol>`;
  });

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');

  // Newlines → <br> (but not inside code/pre blocks we've already replaced)
  text = text.replace(/\n/g, '<br>');

  return text;
}

function copyCode(id) {
  const el = document.getElementById(id);
  const btn = document.getElementById('btn-' + id);
  if (!el || !btn) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    btn.innerHTML = '✓ Copied';
    setTimeout(() => {
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg> Copy`;
    }, 2000);
  });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyMessage(btn) {
  const bubble = btn.closest('.msg-content').querySelector('.msg-bubble');
  navigator.clipboard.writeText(bubble.innerText).then(() => {
    btn.textContent = '✓ Copied';
    setTimeout(() => {
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg> Copy`;
    }, 2000);
  });
}

// ─────────────────────────────────────────────
// MESSAGE REACTIONS
// ─────────────────────────────────────────────
function reactMessage(btn, emoji) {
  const actions = btn.closest('.msg-actions');
  const allReact = actions.querySelectorAll('.reaction-btn');

  const already = btn.dataset.reaction === emoji;

  // Reset all
  allReact.forEach(b => {
    b.classList.remove('reacted');
    b.dataset.reaction = '';
  });

  if (!already) {
    btn.classList.add('reacted');
    btn.dataset.reaction = emoji;
    showToast(emoji === '👍' ? 'Thanks for the feedback!' : 'We\'ll try to do better!', 'success', emoji);
  }
}

function regenerate() {
  const lastUser = [...chatHistory].reverse().find(m => m.role === 'user');
  if (!lastUser) return;
  chatInput.value = lastUser.content;
  chatInput.dispatchEvent(new Event('input'));
  sendMessage();
}

// ─────────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────────
function showTyping() {
  const id = 'typing-' + Date.now();
  const area = document.getElementById('messagesInner');
  const div = document.createElement('div');
  div.id = id; div.className = 'msg ai';
  div.innerHTML = `
    <div class="msg-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
          fill="url(#tGrad)" stroke="none"/>
        <defs><linearGradient id="tGrad"><stop offset="0%" stop-color="#a5b4fc"/><stop offset="100%" stop-color="#e879f9"/></linearGradient></defs>
      </svg>
    </div>
    <div class="msg-content">
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>`;
  area.appendChild(div);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

// ─────────────────────────────────────────────
// WELCOME / MESSAGES VISIBILITY
// ─────────────────────────────────────────────
function showMessagesArea() {
  document.getElementById('welcomeScreen').style.display = 'none';
  document.getElementById('messagesArea').style.display = 'flex';
}

function useSuggestion(text) {
  chatInput.value = text;
  chatInput.dispatchEvent(new Event('input'));
  sendMessage();
}

function startNewChat() {
  sessionId = null;
  chatHistory = [];
  messageCount = 0;
  isStreaming = false;
  document.getElementById('messagesInner').innerHTML = '';
  document.getElementById('messagesArea').style.display = 'none';
  document.getElementById('welcomeScreen').style.display = 'flex';
  document.getElementById('stopBtn').style.display = 'none';
  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  charCount.textContent = '0 / 10000';
  removeAttachedFile();
  showToast('New conversation started', 'success', '✨');
}

function loadChat(el, text) {
  document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  startNewChat();
  setTimeout(() => {
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
    sendMessage();
  }, 200);
}

function addToHistorySidebar(text) {
  const list = document.getElementById('historyList');
  const item = document.createElement('div');
  item.className = 'history-item active';
  item.onclick = () => loadChat(item, text);
  item.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
    <span class="history-text">${text.slice(0, 40)}${text.length > 40 ? '…' : ''}</span>`;
  list.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
  list.prepend(item);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function scrollToBottom() {
  const area = document.getElementById('messagesArea');
  area.scrollTop = area.scrollHeight;
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────
function openUpgradeModal() {
  document.getElementById('upgradeModal').classList.add('open');
}
function connectWallet() {
  if (walletAddress) {
    showToast(`Wallet: ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`, 'info', '👛');
    return;
  }
  document.getElementById('walletModal').classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
function closeModalOnOverlay(e, id) {
  if (e.target.id === id) closeModal(id);
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}
function upgradePlan() {
  closeModal('upgradeModal');
  showToast('Upgrade coming soon! 🚀', 'info', '⚡');
}

async function connectWalletOption(walletName) {
  closeModal('walletModal');
  const btn = document.getElementById('walletBtn');
  if (walletName === 'Phantom' && window.solana?.isPhantom) {
    try {
      const resp = await window.solana.connect();
      walletAddress = resp.publicKey.toString();
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><circle cx="16" cy="12" r="1" fill="currentColor"/></svg>
        ${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`;
      btn.classList.add('connected');
      showToast(`Phantom connected: ${walletAddress.slice(0, 6)}…`, 'success', '👛');
      return;
    } catch { }
  }
  walletAddress = '9xTf…' + Math.random().toString(36).slice(2, 6).toUpperCase();
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><circle cx="16" cy="12" r="1" fill="currentColor"/></svg>
    Connected`;
  btn.classList.add('connected');
  showToast(`${walletName} wallet connected!`, 'success', '✅');
}

// ─────────────────────────────────────────────
// SETTINGS PANEL (Enhanced)
// ─────────────────────────────────────────────
let settingsOpen = false;

function toggleSettings() {
  settingsOpen = !settingsOpen;
  if (settingsOpen) {
    let panel = document.getElementById('settingsPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'settingsPanel';
      panel.className = 'settings-panel';
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <h2 class="settings-title">Settings</h2>

      <div class="settings-row">
        <span class="settings-label">Theme</span>
        <button class="icon-btn" onclick="toggleTheme()" style="width:auto;padding:6px 14px;font-size:12px">Toggle</button>
      </div>

      <div class="settings-row">
        <span class="settings-label">Current Model</span>
        <span style="font-size:13px;color:var(--indigo-l)">${currentModel}</span>
      </div>

      <div class="settings-row">
        <span class="settings-label">Session ID</span>
        <span style="font-size:11px;color:var(--text-4);font-family:monospace">${sessionId ? sessionId.slice(0, 12) + '…' : 'None'}</span>
      </div>

      <div class="settings-section-label">System Prompt</div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;border:none">
        <textarea id="systemPromptInput" class="system-prompt-textarea" placeholder="E.g. Always respond in French. Be concise. You are an expert developer…" rows="5">${escHtml(customSystemPrompt)}</textarea>
        <div style="display:flex;gap:8px">
          <button class="icon-btn" onclick="saveSystemPrompt()" style="width:auto;padding:6px 14px;font-size:12px;flex:1">💾 Save</button>
          <button class="icon-btn" onclick="clearSystemPrompt()" style="width:auto;padding:6px 14px;font-size:12px;flex:1;opacity:.7">🗑 Clear</button>
        </div>
        ${customSystemPrompt ? '<div style="font-size:11px;color:#10b981;margin-top:2px">✓ Custom prompt active</div>' : ''}
      </div>

      <div class="settings-row" style="border:none">
        <span class="settings-label">Export Chat</span>
        <button class="icon-btn" onclick="exportChat()" style="width:auto;padding:6px 14px;font-size:12px">Download</button>
      </div>`;
    setTimeout(() => panel.classList.add('open'), 10);
  } else {
    document.getElementById('settingsPanel')?.classList.remove('open');
  }
}

function saveSystemPrompt() {
  const val = document.getElementById('systemPromptInput')?.value?.trim() || '';
  customSystemPrompt = val;
  localStorage.setItem('sidd-system-prompt', val);
  showToast(val ? 'System prompt saved!' : 'System prompt cleared', 'success', '💾');
  // Refresh panel to show active indicator
  settingsOpen = false;
  toggleSettings();
}

function clearSystemPrompt() {
  customSystemPrompt = '';
  localStorage.removeItem('sidd-system-prompt');
  if (document.getElementById('systemPromptInput')) {
    document.getElementById('systemPromptInput').value = '';
  }
  showToast('System prompt cleared', 'info', '🗑');
  settingsOpen = false;
  toggleSettings();
}

// ─────────────────────────────────────────────
// EXPORT CHAT
// ─────────────────────────────────────────────
function exportChat() {
  if (!chatHistory.length) { showToast('No messages to export', 'info', '📄'); return; }
  const lines = chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const blob = new Blob([`Sidd-AI Chat Export\n${'='.repeat(40)}\n\n${lines}`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `sidd-ai-chat-${Date.now()}.txt`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Chat exported!', 'success', '📥');
}

// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────
function showToast(msg, type = 'info', icon = 'ℹ️') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 280);
  }, 3200);
}

// ─────────────────────────────────────────────
// DEMO FALLBACK REPLIES
// ─────────────────────────────────────────────
function getDemoReply(question) {
  const q = question.toLowerCase();
  if (q.includes('star') || q.includes('space') || q.includes('universe') || q.includes('black hole') || q.includes('moon')) {
    return `✨ **Cosmic Knowledge**\n\nThe universe is estimated to be **13.8 billion years old**, born from the Big Bang — a singularity of infinite density that expanded into everything we see today.\n\nBlack holes form when massive stars (at least **20× the mass of our Sun**) exhaust their nuclear fuel and collapse under gravity, creating a region where escape velocity exceeds the speed of light.\n\nOur Moon formed ~4.5 billion years ago from the debris of a Mars-sized body colliding with early Earth. 🌙\n\n*Connect to the backend with a Groq API key for real AI responses!*`;
  }
  if (q.includes('code') || q.includes('python') || q.includes('javascript') || q.includes('function') || q.includes('api')) {
    return `💻 **Code Assistant**\n\nHere's a quick example:\n\n\`\`\`python\nfrom fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/hello/{name}")\nasync def greet(name: str):\n    return {"message": f"Hello, {name}! From Sidd-AI 🚀"}\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run(app, host="0.0.0.0", port=8000)\n\`\`\`\n\nThis creates a REST API endpoint at \`GET /hello/{name}\`. Run with \`uvicorn main:app --reload\`.\n\n*This is demo mode. Connect to the backend for real ${currentModel} responses!*`;
  }
  if (q.includes('quantum')) {
    return `⚛️ **Quantum Computing**\n\nQuantum computers use **qubits** instead of classical bits. While a bit is either 0 or 1, a qubit can be in **superposition** — both 0 and 1 simultaneously.\n\n**Key concepts:**\n- **Superposition**: A qubit exists in multiple states at once\n- **Entanglement**: Two qubits can be correlated regardless of distance\n- **Interference**: Quantum states can amplify correct answers\n\nThis makes quantum computers exponentially faster for specific problems like cryptography, drug discovery, and optimization.\n\n*Sidd-AI demo mode — connect to backend for full responses!*`;
  }
  if (q.includes('table') || q.includes('markdown')) {
    return `📊 **Markdown Table Example**\n\nHere's a table of the planets:\n\n| Planet | Distance (AU) | Type | Moons |\n|--------|--------------|------|-------|\n| Mercury | 0.39 | Rocky | 0 |\n| Venus | 0.72 | Rocky | 0 |\n| Earth | 1.00 | Rocky | 1 |\n| Mars | 1.52 | Rocky | 2 |\n| Jupiter | 5.20 | Gas Giant | 95 |\n| Saturn | 9.58 | Gas Giant | 146 |\n\nSidd-AI renders **full GFM markdown** including tables, code blocks, headings, and lists! 🌟`;
  }
  return `🌟 **Sidd-AI Response** *(Demo Mode)*\n\nThank you for your question! I'm currently running in demo mode without a live backend connection.\n\nTo get real AI responses powered by **${currentModel}**, make sure:\n1. The backend server is running (\`node server.js\`)\n2. Your Groq API key is in \`server/.env\`\n3. Visit \`http://localhost:3001\`\n\nTry asking about:\n- 🌌 Space & astronomy\n- 💻 Code & programming\n- ⚛️ Quantum computing\n- 📊 Markdown tables\n\nThe shooting stars are real though — you're chatting under the cosmos! 🌠`;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  checkServerHealth();
  setInterval(checkServerHealth, 30000);
  selectModel('Llama 3', 'linear-gradient(135deg,#ec4899,#8b5cf6)');
});
