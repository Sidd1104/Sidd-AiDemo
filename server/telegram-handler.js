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
        await bot.deleteWebHook().catch(err => console.error('[Telegram] Failed to delete webhook:', err.message));

        // Auto-message when connected (to the most recent chat ID, if available)
        try {
            const updates = await bot.getUpdates({ limit: 1, offset: -1 });
            if (updates && updates.length > 0 && updates[0].message) {
                const lastChatId = updates[0].message.chat.id;
                await bot.sendMessage(lastChatId, `🚀 *Sharp AI Bot connected successfully!*\n\nI am now online and ready to assist you.`, { parse_mode: 'Markdown' });
            }
        } catch (err) {
            console.warn('[Telegram] Auto-welcome failed (no recent chats found):', err.message);
        }

        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text || '';

            if (text === '/start') {
                return bot.sendMessage(chatId, `🚀 *Sharp AI Bot is online!*\n\nThis is an auto-message. I am ready to receive your instructions and I will reply using my configured AI brain.`, { parse_mode: 'Markdown' }).catch(err => console.error('[Telegram] Error sending start message:', err.message));
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
        console.log(`[Telegram] Bot started for ${botId}`);
        return true;
    } catch (err) {
        console.error(`[Telegram] Failed to start bot for ${botId}:`, err);
        return false;
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
