const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let client;
let currentQr = null;
let pairingCode = null;
let status = 'disconnected'; // 'disconnected', 'loading', 'qr', 'connected'

/**
 * Initializes the WhatsApp client
 * @param {Function} aiCallback - Function that takes (messageBody, senderId) and returns AI response string
 */
async function initWhatsApp(aiCallback) {
    // If client is already connected or loading, just return
    if (client && status !== 'disconnected') return;

    // If client exists but is disconnected (stuck), destroy it
    if (client && status === 'disconnected') {
        try { await client.destroy(); } catch (e) { }
        client = null;
    }

    status = 'loading';
    currentQr = null;
    pairingCode = null;
    console.log('WA: Initializing...');

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'sharp-ai-session',
            dataPath: path.join(__dirname, 'sessions')
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-extensions',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--no-first-run',
                '--no-zygote',
                '--mute-audio'
            ]
        }
    });

    client.on('qr', (qr) => {
        currentQr = qr;
        status = 'qr';
        console.log('WA: QR Received');
    });

    client.on('ready', async () => {
        currentQr = null;
        status = 'connected';
        console.log('WA: Client is ready!');

        // Auto-message the user their own number to start the conversation easily
        try {
            if (client.info && client.info.wid) {
                const myNumber = client.info.wid._serialized;
                await client.sendMessage(myNumber, '🚀 *Sharp AI Bot is online!*\n\nThis is a self-message to start our conversation. You can now chat with me here, and I will reply using your configured AI brain.');
                console.log('WA: Sent welcome self-message');
            }
        } catch (e) {
            console.error('WA: Could not send welcome message', e);
        }
    });

    client.on('authenticated', () => {
        console.log('WA: Authenticated');
    });

    client.on('auth_failure', msg => {
        console.error('WA: Auth failure', msg);
        status = 'disconnected';
    });

    client.on('message_create', async (msg) => {
        // Ignore messages sent BY the bot, unless it's the user testing their bot in a "Message Yourself" chat
        // If fromMe is true, only process it if it's sent TO the user's own number.
        if (msg.fromMe && msg.to !== msg.from) return;

        // Also, prevent infinite loops if the bot replies to itself in the "Message Yourself" chat
        // (We can check if the msg body is exactly the welcome message or other bot patterns, but easiest is to let it reply if there's no infinite loop, or just skip bot replies if we can identify them)
        // If the message is the bot's own self-message, don't reply to it!
        if (msg.body.includes('Sharp AI Bot is online!') || msg.body.includes('AI provider not available')) return;

        // Only reply to individual chats (not groups or status updates)
        if (msg.from.endsWith('@c.us')) {
            console.log(`WA: Message from ${msg.from}: ${msg.body}`);

            try {
                // Mark as seen and show typing indicator
                const chat = await msg.getChat();
                await chat.sendStateTyping();

                const response = await aiCallback(msg.body, msg.from);

                if (response) {
                    await msg.reply(response);
                }
            } catch (e) {
                console.error('WA AI Callback error:', e.message);
                // Optionally notify the user
            }
        }
    });

    client.on('disconnected', (reason) => {
        console.log('WA: Disconnected', reason);
        status = 'disconnected';
        currentQr = null;
        // Re-initialize after a delay
        setTimeout(() => {
            if (status === 'disconnected') {
                client.initialize().catch(e => console.error('WA Re-init error:', e.message));
            }
        }, 5000);
    });

    try {
        await client.initialize();
    } catch (err) {
        console.error('WA Initialization failed:', err.message);
        status = 'disconnected';
    }
}

async function getQrDataURL() {
    if (!currentQr) return null;
    try {
        return await qrcode.toDataURL(currentQr);
    } catch (err) {
        console.error('QR Generate Error:', err);
        return null;
    }
}

async function requestPairingCode(phoneNumber) {
    if (!client) return { error: 'Client not initialized' };
    try {
        pairingCode = await client.requestPairingCode(phoneNumber.replace(/\D/g, ''));
        return { code: pairingCode };
    } catch (e) {
        console.error('Pairing code request failed:', e);
        return { error: e.message };
    }
}

function getWAStatus() {
    return {
        status,
        pairingCode,
        number: client && client.info ? client.info.wid.user : null
    };
}

async function logoutWhatsApp() {
    if (client) {
        try {
            await client.logout().catch(() => { });
        } catch (e) { console.error('WA Logout error:', e); }
        try {
            await client.destroy().catch(() => { });
        } catch (e) { console.error('WA Destroy error:', e); }

        client = null;
        status = 'disconnected';
        currentQr = null;
        pairingCode = null;

        // Wipe session folder to guarantee fresh QR on next connect
        const sessionPath = path.join(__dirname, 'sessions');
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        return true;
    }
    return false;
}

module.exports = {
    initWhatsApp,
    getQrDataURL,
    getWAStatus,
    logoutWhatsApp,
    requestPairingCode,
    getWANumber: () => client && client.info ? client.info.wid.user : null
};
