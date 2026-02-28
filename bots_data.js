const categories = ['support', 'sales', 'developer', 'education', 'entertainment', 'finance', 'health'];
const models = ['GPT-4o', 'Claude 3.5', 'Gemini 1.5', 'Llama 3', 'Gemini 2.0'];
let bots = [];
let idCount = 1;

const descriptors = {
    support: ['FAQ Assistant', 'Tech Helper', 'Refund Agent', 'Onboarding Bot', 'Ticket Router', 'Billing Support', 'IT Helpdesk', 'Community Mod', 'Feedback Collector', 'Retention Specialist'],
    sales: ['Lead Qualifier', 'Demo Booker', 'Outreach Bot', 'Upsell Agent', 'Price Negotiator', 'Cold Emailer', 'CRM Sync Bot', 'Contract Drafter', 'Product Recommender', 'Discount Approver'],
    developer: ['Code Reviewer', 'Bug Squasher', 'API Doc Generator', 'Regex Helper', 'Git Assistant', 'DB Query Builder', 'Architect Bot', 'Refactor buddy', 'Test Writer', 'DevOps Monitor'],
    education: ['Math Tutor', 'Language Coach', 'History Guide', 'Science Explainer', 'Vocab Builder', 'Essay Grader', 'Study Planner', 'Physics Sim Bot', 'Chemistry Helper', 'Coding Instructor'],
    entertainment: ['Story Weaver', 'Joke Generator', 'Trivia Master', 'RPG Game Master', 'Movie Recommender', 'Poetry Writer', 'Music Suggestor', 'Meme Creator', 'Character Chat', 'Horror Storyteller'],
    finance: ['Crypto Analyst', 'Stock Tracker', 'Budget Planner', 'Tax Helper', 'Expense Categorizer', 'Investment Guide', 'Portfolio Manager', 'Savings Coach', 'DeFi Explainer', 'Forex Predictor'],
    health: ['Diet Planner', 'Workout Coach', 'Mental Health Companion', 'Symptom Checker', 'Meditation Guide', 'Sleep Tracker Auth', 'Hydration Reminder', 'Macro Calculator', 'Stretching Coach', 'Habit Builder']
};

const emojis = {
    support: ['🎧', '💻', '💸', '👋', '🔀', '💳', '🛠️', '🛡️', '📝', '🤝'],
    sales: ['🎯', '📅', '📫', '📈', '🤝', '✉️', '🔄', '📄', '🛍️', '✅'],
    developer: ['👀', '🐛', '📚', '🔍', '🐙', '💾', '🏗️', '🧹', '🧪', '📈'],
    education: ['🧮', '🌍', '📜', '🔬', '📖', '📝', '📅', '🍎', '🧪', '💻'],
    entertainment: ['📖', '😂', '🎲', '🐉', '🍿', '✍️', '🎵', '🖼️', '🎭', '👻'],
    finance: ['📊', '📈', '💰', '🧾', '🗂️', '🧭', '💼', '🐷', '🔗', '💱'],
    health: ['🥗', '💪', '🧠', '🩺', '🧘', '😴', '💧', '⚖️', '🤸', '🧱']
};

for (let c of categories) {
    for (let i = 0; i < 10; i++) {
        bots.push({
            id: 't' + idCount++,
            name: descriptors[c][i],
            emoji: emojis[c][i],
            category: c,
            model: models[Math.floor(Math.random() * models.length)],
            installs: Math.floor(Math.random() * 25000) + 1000,
            price: 0,
            description: `A specialized ${c} bot focusing on ${descriptors[c][i].toLowerCase()} tasks.`,
            system: `You are an expert ${descriptors[c][i]} AI. Be exceptionally helpful and accurate in the ${c} domain.`
        });
    }
}

export const MARKETPLACE_TEMPLATES = bots;
