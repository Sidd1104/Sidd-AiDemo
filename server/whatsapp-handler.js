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
    if (client && status !== 'disconnected') return;

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
                '--disable-gpu'
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
        if (msg.fromMe && msg.to !== msg.from) return;
        if (msg.body.includes('Sharp AI Bot is online!') || msg.body.includes('AI provider not available')) return;

        if (msg.from.endsWith('@c.us')) {
            console.log(`WA: Message from ${msg.from}: ${msg.body}`);
            try {
                const chat = await msg.getChat();
                await chat.sendStateTyping().catch(() => { });

                const response = await aiCallback(msg.body, msg.from);
                if (response) {
                    await msg.reply(response);
                }
            } catch (e) {
                console.error('WA AI Callback error:', e.message);
            }
        }
    });

    client.on('disconnected', (reason) => {
        console.log('WA: Disconnected', reason);
        status = 'disconnected';
        currentQr = null;
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
