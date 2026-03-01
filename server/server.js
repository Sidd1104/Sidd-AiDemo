/**
 * Sharp AI Platform — Backend Server
 * Supports: OpenAI · Anthropic · Google Gemini · Groq (Llama 3)
 * Streaming: Server-Sent Events (SSE)
 */

'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// ── AI SDK Imports ────────────────────────────────────────────────────────────

let openaiClient, anthropicClient, googleClient, groqClient;
const WhatsApp = require('./whatsapp-handler');

try {
    const OpenAI = require('openai');
    if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-...')) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        console.log('✅ OpenAI client initialized');
    }
} catch (e) { console.warn('⚠️  OpenAI SDK not loaded:', e.message); }

try {
    const Anthropic = require('@anthropic-ai/sdk');
    if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')) {
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log('✅ Anthropic client initialized');
    }
} catch (e) { console.warn('⚠️  Anthropic SDK not loaded:', e.message); }

try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    if (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY.startsWith('AIza...')) {
        googleClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        console.log('✅ Google Gemini client initialized');
    }
} catch (e) { console.warn('⚠️  Google AI SDK not loaded:', e.message); }

try {
    const Groq = require('groq-sdk');
    if (process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY.startsWith('gsk_...')) {
        groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
        console.log('✅ Groq client initialized');
    }
} catch (e) { console.warn('⚠️  Groq SDK not loaded:', e.message); }

// ── App Setup ─────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow the frontend's file:// or http://localhost origins
app.use(cors({
    origin: (origin, cb) => cb(null, true), // Allow all during dev
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '4mb' }));

// ── Serve Frontend Static Files ───────────────────────────────────────────────
// Serves index.html, style.css, app.js from the parent aifredo-clone/ folder
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR, { index: 'index.html' }));

// Rate limiting — prevent abuse
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    skip: () => true // Definitely skip all local limiting
});

// ── In-Memory Session Store ───────────────────────────────────────────────────

const sessions = new Map(); // sessionId → { messages: [], model: '' }

function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, { messages: [], model: 'GPT-4o', createdAt: Date.now() });
    }
    return sessions.get(sessionId);
}

// Cleanup sessions older than 2 hours
setInterval(() => {
    const twoHours = 2 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [id, session] of sessions) {
        if (now - session.createdAt > twoHours) sessions.delete(id);
    }
}, 15 * 60 * 1000);

// ── Model → Provider Routing ──────────────────────────────────────────────────

const MODEL_ROUTES = {
    // OpenAI
    'gpt-4o': { provider: 'openai', model: 'gpt-4o' },
    'gpt-4': { provider: 'openai', model: 'gpt-4-turbo' },
    'gpt-3.5': { provider: 'openai', model: 'gpt-3.5-turbo' },
    // Anthropic
    'claude-3.5': { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    'claude-3': { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    // Google
    'gemini-2.0': { provider: 'google', model: 'gemini-2.0-flash' },
    'gemini-2.5': { provider: 'google', model: 'gemini-2.5-flash' },
    'gemini-1.5': { provider: 'google', model: 'gemini-1.5-flash' },
    'gemini-1.5-pro': { provider: 'google', model: 'gemini-1.5-pro' },
    'gemini-pro': { provider: 'google', model: 'gemini-2.0-flash' }, // Default to 2.0-flash
    // Groq (Llama)
    'llama-3': { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    'llama-3-small': { provider: 'groq', model: 'llama-3.1-8b-instant' },
    'mixtral': { provider: 'groq', model: 'mixtral-8x7b-32768' },
};

function resolveModel(displayName) {
    const name = (displayName || '').toLowerCase().replace(/\s+/g, '-');

    // Helper to check if a provider is actually ready
    const isReady = (p) => {
        if (p === 'openai') return !!openaiClient;
        if (p === 'anthropic') return !!anthropicClient;
        if (p === 'google') return !!googleClient;
        if (p === 'groq') return !!groqClient;
        return false;
    };

    // 1. Direct match
    if (MODEL_ROUTES[name] && isReady(MODEL_ROUTES[name].provider)) {
        return MODEL_ROUTES[name];
    }

    // 2. Specific case: "Gemini 1.5 Pro" -> "gemini-1.5-pro"
    if (name.includes('gemini') && name.includes('pro') && isReady('google')) {
        return MODEL_ROUTES['gemini-pro'];
    }

    // 3. Partial match
    for (const [key, val] of Object.entries(MODEL_ROUTES)) {
        if ((name.includes(key) || key.includes(name)) && isReady(val.provider)) {
            return val;
        }
    }

    // 4. Fallback priority
    if (groqClient) return MODEL_ROUTES['llama-3'];
    if (googleClient) return MODEL_ROUTES['gemini-2.0'] || MODEL_ROUTES['gemini-1.5'];
    if (openaiClient) return MODEL_ROUTES['gpt-4o'];
    if (anthropicClient) return MODEL_ROUTES['claude-3.5'];

    return null;
}

// ── Available Models List ─────────────────────────────────────────────────────

const ALL_MODELS = [
    { id: 'GPT-4o', provider: 'OpenAI', gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)', tier: 'Pro', available: !!openaiClient },
    { id: 'Claude 3.5', provider: 'Anthropic', gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', tier: 'Pro', available: !!anthropicClient },
    { id: 'Gemini 2.0', provider: 'Google', gradient: 'linear-gradient(135deg,#10b981,#06b6d4)', tier: 'New', available: !!googleClient },
    { id: 'Llama 3', provider: 'Groq/Meta', gradient: 'linear-gradient(135deg,#ec4899,#8b5cf6)', tier: 'Free', available: !!groqClient },
];

// ── Health Check ──────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '1.2.0',
        providers: {
            openai: !!openaiClient,
            anthropic: !!anthropicClient,
            google: !!googleClient,
            groq: !!groqClient,
        },
        models: ALL_MODELS,
        sessionCount: sessions.size,
    });
});

// ── Configuration Endpoints ───────────────────────────────────────────────────

app.get('/api/config/firebase', (req, res) => {
    // Return only the public web config
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
});

// ── Models Endpoint ───────────────────────────────────────────────────────────

app.get('/api/models', (req, res) => {
    res.json({ models: ALL_MODELS });
});

// ── Session Endpoints ─────────────────────────────────────────────────────────

app.post('/api/sessions', (req, res) => {
    const sessionId = uuidv4();
    getSession(sessionId);
    res.json({ sessionId });
});

app.get('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
});

app.delete('/api/sessions/:id', (req, res) => {
    sessions.delete(req.params.id);
    res.json({ success: true });
});

// ── Main Chat Endpoint (SSE Streaming) ───────────────────────────────────────

app.post('/api/chat', chatLimiter, async (req, res) => {
    const { message, model: modelName, sessionId, systemPrompt } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message is required.' });
    }

    // Resolve model → provider
    const route = resolveModel(modelName);
    if (!route) {
        return res.status(503).json({
            error: 'No AI provider available. Please add an API key in server/.env and restart.',
        });
    }

    // Get/create session
    const sid = sessionId || uuidv4();
    const session = getSession(sid);

    // Append user message to history
    session.messages.push({ role: 'user', content: message });
    session.model = modelName;

    // ── Set up SSE headers ──────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send session ID so frontend can track it
    res.write(`event: session\ndata: ${JSON.stringify({ sessionId: sid })}\n\n`);

    let fullResponse = '';

    const sendChunk = (text) => {
        fullResponse += text;
        res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`);
    };

    const sendDone = () => {
        // Save AI response to session history
        session.messages.push({ role: 'assistant', content: fullResponse });
        res.write(`event: done\ndata: ${JSON.stringify({ sessionId: sid, model: route.model, provider: route.provider })}\n\n`);
        res.end();
    };

    const sendError = (msg) => {
        res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
    };

    // System message
    const systemMsg = systemPrompt || `You are Sharp AI, a powerful and helpful AI assistant. Today's date is ${new Date().toDateString()}. Be concise, accurate, and professional. Use markdown formatting where appropriate.`;

    // Build message history for context (last 20 messages)
    const historyMessages = session.messages.slice(-20);

    try {
        switch (route.provider) {

            // ── OpenAI ────────────────────────────────────────────────────────────
            case 'openai': {
                const stream = await openaiClient.chat.completions.create({
                    model: route.model,
                    messages: [
                        { role: 'system', content: systemMsg },
                        ...historyMessages,
                    ],
                    stream: true,
                    max_tokens: 2048,
                    temperature: 0.7,
                });
                for await (const chunk of stream) {
                    const text = chunk.choices[0]?.delta?.content || '';
                    if (text) sendChunk(text);
                }
                sendDone();
                break;
            }

            // ── Anthropic ─────────────────────────────────────────────────────────
            case 'anthropic': {
                const anthropicMessages = historyMessages.map(m => ({
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content,
                }));
                const stream = anthropicClient.messages.stream({
                    model: route.model,
                    max_tokens: 2048,
                    system: systemMsg,
                    messages: anthropicMessages,
                });
                for await (const event of stream) {
                    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                        sendChunk(event.delta.text);
                    }
                }
                sendDone();
                break;
            }

            // ── Google Gemini ─────────────────────────────────────────────────────
            case 'google': {
                const genModel = googleClient.getGenerativeModel({
                    model: route.model,
                    systemInstruction: systemMsg ? { parts: [{ text: systemMsg }] } : undefined
                });

                // Build Gemini chat history (alternating user/model)
                const geminiHistory = [];
                const msgs = historyMessages.slice(0, -1); // Exclude last (current) user msg
                for (const m of msgs) {
                    geminiHistory.push({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }],
                    });
                }

                const chat = genModel.startChat({
                    history: geminiHistory,
                    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
                });

                const result = await chat.sendMessageStream(message);
                let hasTokens = false;
                for await (const chunk of result.stream) {
                    try {
                        const text = chunk.text();
                        if (text) {
                            sendChunk(text);
                            hasTokens = true;
                        }
                    } catch (e) {
                        console.warn('[Gemini Stream] Parsing error or safety block:', e.message);
                        if (e.message.includes('SAFETY')) {
                            sendError('Blocked by safety filters.');
                            return;
                        }
                    }
                }
                if (!hasTokens) {
                    // Try to get response text if stream was blocked/empty but not errored
                    try {
                        const response = await result.response;
                        const text = response.text();
                        if (text) sendChunk(text);
                        else sendError('Gemini returned an empty response.');
                    } catch (e) {
                        sendError(`Gemini error: ${e.message}`);
                    }
                    return;
                }
                sendDone();
                break;
            }

            // ── Groq (Llama / Mixtral) ────────────────────────────────────────────
            case 'groq': {
                const stream = await groqClient.chat.completions.create({
                    model: route.model,
                    messages: [
                        { role: 'system', content: systemMsg },
                        ...historyMessages,
                    ],
                    stream: true,
                    max_tokens: 2048,
                    temperature: 0.7,
                });
                for await (const chunk of stream) {
                    const text = chunk.choices[0]?.delta?.content || '';
                    if (text) sendChunk(text);
                }
                sendDone();
                break;
            }

            default:
                sendError('Unknown provider.');
        }
    } catch (err) {
        console.error(`[${route.provider}] Error:`, err.message);

        if (err.status === 401 || err.code === 'invalid_api_key') {
            sendError('Invalid API key. Please check your .env file and restart the server.');
        } else if (err.status === 429 || err.message?.includes('429') || err.message?.includes('quota')) {
            sendError(`${route.provider.toUpperCase()} Rate Limit: You have reached the limit for this API key. Please wait or upgrade your plan.`);
        } else if (err.status === 402) {
            sendError(`${route.provider.toUpperCase()} Billing Error: Insufficient credits on this API key.`);
        } else if (err.message?.includes('SAFETY')) {
            sendError('The response was blocked by content safety filters.');
        } else {
            sendError(`${route.provider.toUpperCase()} error: ${err.message}`);
        }
    }
});

// ── Universal QR Generator ───────────────────────────────────────────────────
app.get('/api/qr', async (req, res) => {
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'Data query parameter is required' });
    try {
        const qrcode = require('qrcode');
        const qr = await qrcode.toDataURL(data, { margin: 2, scale: 8 });
        res.json({ qr });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// ── WhatsApp Endpoints ───────────────────────────────────────────────────────

app.get('/api/whatsapp/status', (req, res) => {
    res.json(WhatsApp.getWAStatus());
});

app.get('/api/whatsapp/qr', async (req, res) => {
    const qr = await WhatsApp.getQrDataURL();
    if (qr) res.json({ qr });
    else res.status(404).json({ error: 'QR not available' });
});

app.post('/api/whatsapp/pair', async (req, res) => {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Phone number required' });

    try {
        const result = await WhatsApp.requestPairingCode(number);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/whatsapp/connect', async (req, res) => {
    const { botId } = req.body;

    // Initialize WA with a callback that uses the specified bot
    WhatsApp.initWhatsApp(async (message, sender) => {
        // Find the bot configuration (simplified as we don't have a DB here, use sessions or a placeholder)
        // For now, use a general session
        const session = getSession(`wa-${sender}`);
        session.messages.push({ role: 'user', content: message });
        const response = await getAIResponse(message, 'Llama 3', session.messages.slice(0, -1), "You are Sharp AI on WhatsApp.");
        session.messages.push({ role: 'assistant', content: response });
        return response;
    });

    res.json({ success: true, message: 'WhatsApp initialization started' });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
    const success = await WhatsApp.logoutWhatsApp();
    res.json({ success });
});

/**
 * Reusable AI Completion Helper (Non-SSE)
 */
async function getAIResponse(message, modelName, history = [], systemPrompt = "") {
    const route = resolveModel(modelName);
    if (!route) return "AI provider not available.";

    const systemMsg = systemPrompt || "You are Sharp AI assistant.";
    const historyMsgs = history.slice(-10);

    try {
        if (route.provider === 'openai') {
            const completion = await openaiClient.chat.completions.create({
                model: route.model,
                messages: [{ role: 'system', content: systemMsg }, ...historyMsgs, { role: 'user', content: message }],
            });
            return completion.choices[0].message.content;
        } else if (route.provider === 'google') {
            const genModel = googleClient.getGenerativeModel({ model: route.model, systemInstruction: { parts: [{ text: systemMsg }] } });
            const chat = genModel.startChat({
                history: historyMsgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
            });
            const result = await chat.sendMessage(message);
            return result.response.text();
        } else if (route.provider === 'groq') {
            const completion = await groqClient.chat.completions.create({
                model: route.model,
                messages: [{ role: 'system', content: systemMsg }, ...historyMsgs, { role: 'user', content: message }],
            });
            return completion.choices[0].message.content;
        }
    } catch (e) {
        console.error('[AI Helper Error]', e.message);
        return `Error: ${e.message}`;
    }
    return "Unsupported provider.";
}

// ── Wallet Verification ───────────────────────────────────────────────────────

app.post('/api/wallet/verify', async (req, res) => {
    try {
        const { publicKey, signature, message: signedMessage } = req.body;

        if (!publicKey || !signature || !signedMessage) {
            return res.status(400).json({ error: 'publicKey, signature, and message are required.' });
        }

        // Lazy-load Solana deps
        const bs58 = require('bs58');
        const nacl = require('tweetnacl');

        const pubKeyBytes = bs58.decode(publicKey);
        const sigBytes = new Uint8Array(Buffer.from(signature, 'base64'));
        const msgBytes = new TextEncoder().encode(signedMessage);
        const verified = nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

        if (!verified) {
            return res.status(401).json({ error: 'Signature verification failed.' });
        }

        res.json({
            verified: true,
            publicKey,
            shortAddress: `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`,
        });
    } catch (err) {
        console.error('[Wallet Verify]', err.message);
        res.status(500).json({ error: `Verification error: ${err.message}` });
    }
});

// ── Image Generation ──────────────────────────────────────────────────────────

app.post('/api/image', async (req, res) => {
    const { prompt, size = '1024x1024' } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'Prompt is required.' });
    }

    const safePrompt = prompt.trim().slice(0, 1000);

    // Try OpenAI DALL-E 3 first
    if (openaiClient) {
        try {
            const response = await openaiClient.images.generate({
                model: 'dall-e-3',
                prompt: safePrompt,
                n: 1,
                size: '1024x1024',
                quality: 'standard',
            });
            const imgUrl = response.data[0]?.url;
            if (imgUrl) {
                return res.json({ url: imgUrl, provider: 'openai', prompt: safePrompt });
            }
        } catch (err) {
            console.warn('[Image/OpenAI]', err.message);
        }
    }

    // Fallback: Pollinations.ai (free, no key needed)
    const encoded = encodeURIComponent(safePrompt);
    const seed = Math.floor(Math.random() * 9999999);
    const url = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=512&seed=${seed}&nologo=true&model=flux`;
    res.json({ url, provider: 'pollinations', prompt: safePrompt });
});



// ══════════════════════════════════════════════════════════════════════════════
// BOT MANAGEMENT API
// ══════════════════════════════════════════════════════════════════════════════

// In-memory bot store (keyed by botId per sessionId/user)
const botsStore = new Map(); // botId → botObject

function getBotOrFail(req, res) {
    const bot = botsStore.get(req.params.id);
    if (!bot) { res.status(404).json({ error: 'Bot not found' }); return null; }
    return bot;
}

// GET /api/bots — list all bots
app.get('/api/bots', (req, res) => {
    const bots = [...botsStore.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    res.json({ bots, count: bots.length });
});

// POST /api/bots — create a bot
app.post('/api/bots', (req, res) => {
    const { name, emoji, desc, cat, model, systemPrompt, creativity, responseLen } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

    const bot = {
        id: crypto.randomUUID(),
        name: name.trim().slice(0, 80),
        emoji: emoji || '🤖',
        desc: (desc || '').slice(0, 300),
        cat: cat || 'other',
        model: model || 'Llama 3',
        systemPrompt: (systemPrompt || '').slice(0, 4000),
        creativity: Math.min(100, Math.max(0, parseInt(creativity) || 50)),
        responseLen: ['short', 'medium', 'long'].includes(responseLen) ? responseLen : 'medium',
        channels: {},
        active: true,
        messageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    botsStore.set(bot.id, bot);
    console.log(`[Bot] Created: ${bot.name} (${bot.id})`);
    res.status(201).json(bot);
});

// GET /api/bots/:id — get single bot
app.get('/api/bots/:id', (req, res) => {
    const bot = getBotOrFail(req, res);
    if (bot) res.json(bot);
});

// PUT /api/bots/:id — update bot
app.put('/api/bots/:id', (req, res) => {
    const bot = getBotOrFail(req, res); if (!bot) return;
    const allowed = ['name', 'emoji', 'desc', 'cat', 'model', 'systemPrompt', 'creativity', 'responseLen', 'active'];
    allowed.forEach(k => { if (req.body[k] !== undefined) bot[k] = req.body[k]; });
    bot.updatedAt = Date.now();
    botsStore.set(bot.id, bot);
    res.json(bot);
});

// DELETE /api/bots/:id — delete bot
app.delete('/api/bots/:id', (req, res) => {
    if (!botsStore.has(req.params.id)) return res.status(404).json({ error: 'Bot not found' });
    botsStore.delete(req.params.id);
    res.json({ deleted: true, id: req.params.id });
});

// POST /api/bots/:id/channels/telegram — connect Telegram
app.post('/api/bots/:id/channels/telegram', async (req, res) => {
    const { token, name, model, systemPrompt } = req.body;
    let bot = botsStore.get(req.params.id);

    // If the backend restarted, the in-memory botsStore might be empty.
    // Create a temporary bot config from the payload so it can still connect.
    if (!bot) {
        bot = {
            id: req.params.id,
            name: name || 'Bot',
            model: model || 'Llama 3',
            systemPrompt: systemPrompt || 'You are a helpful AI assistant.',
            channels: {},
            messageCount: 0,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        botsStore.set(bot.id, bot);
    }

    if (!token || !token.match(/^\d+:.{20,}$/)) {
        return res.status(400).json({ error: 'Invalid Telegram bot token format' });
    }

    // Deploy to telegram
    const telegramHandler = require('./telegram-handler');
    const result = await telegramHandler.startTelegramBot(bot.id, token, async (text, senderId) => {
        const session = getSession(`${bot.id}-${senderId}`);
        session.messages.push({ role: 'user', content: text });
        const response = await getAIResponse(text, bot.model, session.messages.slice(0, -1), bot.systemPrompt || `You are ${bot.name}.`);
        session.messages.push({ role: 'assistant', content: response });
        bot.messageCount = (bot.messageCount || 0) + 1;
        botsStore.set(bot.id, bot);
        return response;
    });

    if (!result || !result.success) {
        return res.status(500).json({ error: 'Failed to deploy Telegram bot. Check your token.' });
    }

    const botUrl = `https://t.me/${result.username}?start=connect`;
    bot.channels.telegram = { connected: true, token, botUrl, connectedAt: Date.now() };
    bot.updatedAt = Date.now();
    botsStore.set(bot.id, bot);
    console.log(`[Bot/${bot.id}] Telegram connected: ${botUrl}`);
    res.json({ connected: true, channel: 'telegram', botUrl });
});

// POST /api/bots/:id/channels/discord — connect Discord webhook
app.post('/api/bots/:id/channels/discord', (req, res) => {
    const bot = getBotOrFail(req, res); if (!bot) return;
    const { webhookUrl } = req.body;
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return res.status(400).json({ error: 'Invalid Discord webhook URL' });
    }
    bot.channels.discord = { connected: true, webhookUrl, connectedAt: Date.now() };
    bot.updatedAt = Date.now();
    botsStore.set(bot.id, bot);
    res.json({ connected: true, channel: 'discord' });
});

// POST /api/bots/:id/channels/slack — connect Slack
app.post('/api/bots/:id/channels/slack', (req, res) => {
    const bot = getBotOrFail(req, res); if (!bot) return;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Slack token required' });
    bot.channels.slack = { connected: true, token, connectedAt: Date.now() };
    bot.updatedAt = Date.now();
    botsStore.set(bot.id, bot);
    res.json({ connected: true, channel: 'slack' });
});

// POST /api/bots/:id/message — send a test message to a bot and stream back reply
app.post('/api/bots/:id/message', async (req, res) => {
    const bot = getBotOrFail(req, res); if (!bot) return;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // Build messages array with the bot's system prompt
    const messages = [
        { role: 'system', content: bot.systemPrompt || `You are ${bot.name}, a helpful AI assistant.` },
        { role: 'user', content: message },
    ];

    // Pipe through the existing chat logic (Groq/Llama 3 as default for preview)
    try {
        const reply = await groqClient.chat.completions.create({
            model: 'llama3-8b-8192',
            messages,
            max_tokens: bot.responseLen === 'short' ? 200 : bot.responseLen === 'long' ? 1200 : 600,
            temperature: bot.creativity / 100,
        });
        bot.messageCount = (bot.messageCount || 0) + 1;
        botsStore.set(bot.id, bot);
        res.json({ reply: reply.choices[0]?.message?.content || '' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/marketplace — get available bot templates
app.get('/api/marketplace', (req, res) => {
    const TEMPLATES = [
        { id: 't1', name: 'Customer Support Bot', emoji: '🎧', category: 'support', model: 'GPT-4o', installs: 12840, price: 0, description: 'Handles FAQs, escalates complex issues, tracks tickets.' },
        { id: 't2', name: 'Sales Assistant', emoji: '💼', category: 'sales', model: 'Claude 3.5', installs: 9200, price: 0, description: 'Qualifies leads, books demos, answers product questions.' },
        { id: 't3', name: 'Code Helper', emoji: '💻', category: 'developer', model: 'GPT-4o', installs: 22100, price: 0, description: 'Debugs code, explains concepts, writes clean functions.' },
        { id: 't4', name: 'Language Teacher', emoji: '🌍', category: 'education', model: 'Gemini 1.5', installs: 7400, price: 0, description: 'Teaches vocabulary, grammar, and conversation practice.' },
        { id: 't5', name: 'Recipe Bot', emoji: '👨‍🍳', category: 'entertainment', model: 'Llama 3', installs: 5800, price: 0, description: 'Suggests recipes based on ingredients you have.' },
        { id: 't6', name: 'Fitness Coach', emoji: '💪', category: 'health', model: 'GPT-4o', installs: 8900, price: 0, description: 'Creates workout plans, tracks progress, motivates.' },
        { id: 't7', name: 'FAQ Bot', emoji: '❓', category: 'support', model: 'Llama 3', installs: 18000, price: 0, description: 'Instantly answers common questions with your custom FAQ.' },
        { id: 't8', name: 'News Summarizer', emoji: '📰', category: 'entertainment', model: 'Claude 3.5', installs: 4200, price: 0, description: 'Summarizes news topics in bullet points.' },
        { id: 't9', name: 'GitHub Issues Bot', emoji: '🐙', category: 'developer', model: 'GPT-4o', installs: 3100, price: 0, description: 'Helps triage GitHub issues, suggests labels and solutions.' },
        { id: 't10', name: 'Crypto Analyst', emoji: '📊', category: 'finance', model: 'Gemini 1.5', installs: 6700, price: 0, description: 'Explains crypto concepts, analyzes market trends.' },
    ];
    const { category, q } = req.query;
    let results = TEMPLATES;
    if (category && category !== 'all') results = results.filter(t => t.category === category);
    if (q) results = results.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
    res.json({ templates: results, count: results.length });
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH API
// ══════════════════════════════════════════════════════════════════════════════

const usersStore = new Map();   // userId  → { id, name, email, passwordHash, createdAt }
const authTokens = new Map();   // token   → userId

function getUserByEmail(email) {
    for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
}

function bearerToken(req) {
    const auth = req.headers['authorization'] || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return null;
}

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Valid email required.' });
        if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        if (getUserByEmail(email)) return res.status(409).json({ error: 'Email already registered. Please log in.' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = { id: uuidv4(), name: name.trim(), email: email.toLowerCase().trim(), passwordHash, createdAt: Date.now() };
        usersStore.set(user.id, user);

        const token = uuidv4() + '-' + uuidv4();
        authTokens.set(token, user.id);
        console.log(`[Auth] Registered: ${user.email}`);
        res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
    } catch (err) {
        console.error('[Auth/Register]', err.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
        const user = getUserByEmail(email);
        if (!user) return res.status(401).json({ error: 'No account found with that email.' });
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

        const token = uuidv4() + '-' + uuidv4();
        authTokens.set(token, user.id);
        console.log(`[Auth] Login: ${user.email}`);
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
    } catch (err) {
        console.error('[Auth/Login]', err.message);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
    const token = bearerToken(req);
    if (token) authTokens.delete(token);
    res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
    const token = bearerToken(req);
    if (!token || !authTokens.has(token)) return res.status(401).json({ error: 'Not authenticated.' });
    const user = usersStore.get(authTokens.get(token));
    if (!user) return res.status(401).json({ error: 'User not found.' });
    res.json({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, bio: user.bio || '' });
});

// PUT /api/auth/me
app.put('/api/auth/me', (req, res) => {
    const token = bearerToken(req);
    if (!token || !authTokens.has(token)) return res.status(401).json({ error: 'Not authenticated.' });
    const userId = authTokens.get(token);
    const user = usersStore.get(userId);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    const { name, bio } = req.body;
    if (name) user.name = name.trim().slice(0, 100);
    if (bio !== undefined) user.bio = (bio || '').slice(0, 500);

    usersStore.set(userId, user);
    console.log(`[Auth] Profile Update: ${user.email}`);
    res.json({ id: user.id, name: user.name, email: user.email, bio: user.bio, updatedAt: Date.now() });
});

// ── Catch-All: Serve any file from frontend dir (multi-page support) ──────────


app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // Try to serve the exact file first (dashboard.html, builder.html, etc.)
    const filePath = path.join(FRONTEND_DIR, req.path === '/' ? 'index.html' : req.path);
    const fs = require('fs');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(filePath);
    }
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── 404 Handler ───────────────────────────────────────────────────────────────

app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║       Sharp AI Backend — Running         ║');
        console.log('╠══════════════════════════════════════════╣');
        console.log(`║  Server : http://localhost:${PORT}           ║`);
        console.log(`║  Health : http://localhost:${PORT}/api/health ║`);
        console.log('╠══════════════════════════════════════════╣');
        console.log(`║  OpenAI   : ${openaiClient ? '✅ Ready   ' : '❌ No key  '}                  ║`);
        console.log(`║  Anthropic: ${anthropicClient ? '✅ Ready   ' : '❌ No key  '}                  ║`);
        console.log(`║  Google   : ${googleClient ? '✅ Ready   ' : '❌ No key  '}                  ║`);
        console.log(`║  Groq     : ${groqClient ? '✅ Ready   ' : '❌ No key  '}                  ║`);
        console.log('╚══════════════════════════════════════════╝\n');

        const anyReady = openaiClient || anthropicClient || googleClient || groqClient;
        if (!anyReady) {
            console.warn('⚠️  No API keys configured!');
            console.warn('   Copy .env.example → .env and add at least one API key.');
            console.warn('   Groq (Llama 3) and Google Gemini are FREE to start.\n');
        }
    });
}

module.exports = { app, resolveModel, MODEL_ROUTES };
