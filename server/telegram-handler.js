const TelegramBot = require('node-telegram-bot-api');

// Store active bots by botId
const activeBots = new Map();

async function startTelegramBot(botId, token, aiCallback) {
    if (activeBots.has(botId)) {
        await stopTelegramBot(botId);
    }

    try {
        const bot = new TelegramBot(token, { polling: true });

        // Remove any existing webhook to ensure polling works without Conflicts
        bot.deleteWebHook().catch(err => console.error('[Telegram] Failed to delete webhook:', err.message));

        // Let's attempt to send "i am active sir ...." to recent chats immediately upon startup
        try {
            const updates = await bot.getUpdates({ limit: 10, timeout: 0 });
            if (updates && updates.length > 0) {
                const chatIds = new Set();
                updates.forEach(u => {
                    if (u.message && u.message.chat && u.message.chat.id) chatIds.add(u.message.chat.id);
                });
                const msgText = "i am active sir ....";
                chatIds.forEach(id => {
                    bot.sendMessage(id, msgText).catch(e => console.error('[Telegram] Auto-welcome error:', e.message));
                });
            }
        } catch (err) {
            console.error('[Telegram] Could not fetch getUpdates for welcome message:', err.message);
        }

        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text || '';

            if (text === '/start') {
                return bot.sendMessage(chatId, `i am active sir ....`).catch(err => console.error('[Telegram] Error sending start message:', err.message));
            }

            if (text) {
                try {
                    // Show typing indicator (catch error to prevent unhandled rejections)
                    bot.sendChatAction(chatId, 'typing').catch(err => console.error('[Telegram] Error sending chat action:', err.message));

                    const response = await aiCallback(text, `tg-${chatId}`);
                    if (response) {
                        bot.sendMessage(chatId, response).catch(err => console.error('[Telegram] Error sending response:', err.message));
                    } else {
                        bot.sendMessage(chatId, 'Sorry, my AI brain returned an empty response.').catch(err => console.error('[Telegram] Error sending empty response message:', err.message));
                    }
                } catch (e) {
                    console.error('[Telegram] Error handling message:', e);
                    bot.sendMessage(chatId, 'Sorry, I encountered an error while processing your request: ' + e.message).catch(err => console.error('[Telegram] Error sending error message:', err.message));
                }
            }
        });

        bot.on('polling_error', (error) => {
            console.error('[Telegram Polling Error]', error.message);
        });

        activeBots.set(botId, bot);
        const me = await bot.getMe();
        console.log(`[Telegram] Bot started for ${botId} (@${me.username})`);
        return { success: true, username: me.username };
    } catch (err) {
        console.error(`[Telegram] Failed to start bot for ${botId}:`, err);
        return { success: false };
    }
}

async function stopTelegramBot(botId) {
    if (activeBots.has(botId)) {
        const bot = activeBots.get(botId);
        try {
            await bot.stopPolling();
            activeBots.delete(botId);
            console.log(`[Telegram] Bot stopped for ${botId}`);
            return true;
        } catch (e) {
            console.error(`[Telegram] Failed to stop bot:`, e);
        }
    }
    return false;
}

module.exports = {
    startTelegramBot,
    stopTelegramBot
};
