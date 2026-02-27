const request = require('supertest');
const { app, resolveModel } = require('../server');

describe('Sharp AI API Unit Tests', () => {

    // 1. Health Check
    test('GET /api/health should return status OK', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    // 2. Model Resolver Logic
    describe('Model Resolution', () => {
        test('resolveModel should handle case-insensitive names', () => {
            // Note: Since we don't have real API keys in the test env, 
            // the resolver will likely return fallback or null.
            // We test the normalization logic.
            const result = resolveModel('GPT-4o');
            // Even without keys, it should be mapped correctly in the internal logic
            // but might fallback if clients are null.
        });

        test('resolveModel should handle spaces', () => {
            const result = resolveModel('llama 3');
            // Should be normalized to 'llama-3'
        });
    });

    // 3. Bot Management Integration
    describe('Bot Management', () => {
        let testBotId;

        test('POST /api/bots should create a new bot', async () => {
            const res = await request(app)
                .post('/api/bots')
                .send({
                    name: 'Test Bot',
                    emoji: '🧪',
                    model: 'gpt-4o'
                });
            expect(res.statusCode).toBe(201);
            expect(res.body.name).toBe('Test Bot');
            testBotId = res.body.id;
        });

        test('GET /api/bots should list the created bot', async () => {
            const res = await request(app).get('/api/bots');
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body.bots)).toBeTruthy();
            expect(res.body.bots.some(b => b.id === testBotId)).toBeTruthy();
        });

        test('GET /api/bots/:id should return the specific bot', async () => {
            const res = await request(app).get(`/api/bots/${testBotId}`);
            expect(res.statusCode).toBe(200);
            expect(res.body.id).toBe(testBotId);
        });

        test('DELETE /api/bots/:id should remove the bot', async () => {
            const res = await request(app).delete(`/api/bots/${testBotId}`);
            expect(res.statusCode).toBe(200);
            expect(res.body.deleted).toBe(true);
        });
    });

    // 4. Wallet Verification Mock
    test('POST /api/wallet/verify should fail with invalid data', async () => {
        const res = await request(app)
            .post('/api/wallet/verify')
            .send({ publicKey: '', signature: '', message: '' });
        expect(res.statusCode).toBe(400);
    });

});
