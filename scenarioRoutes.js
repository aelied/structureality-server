// scenarioRoutes.js
// Wire up in server.js with these 2 lines (pass your existing `db` object):
//
//   const scenarioRoutes = require('./scenarioRoutes');
//   app.use('/api/scenarios', scenarioRoutes(db));
//
// Place those 2 lines BEFORE your connectDB().then(...) block, e.g. right
// after the other route definitions but still inside the file.

const express = require('express');

module.exports = function (db) {
    const router = express.Router();

    const COLLECTION = 'scenarioConfig';
    const DOC_ID     = 'activeScenarios';

    // Default config returned when nothing has been saved yet
    const DEFAULT_SCENARIOS = {
        Arrays:      ['ParkingLot', 'VendingMachine'],
        Queue:       ['ParkingLot', 'VendingMachine'],
        Stacks:      ['ParkingLot', 'VendingMachine'],
        LinkedLists: ['ParkingLot', 'VendingMachine'],
        Trees:       ['ParkingLot', 'VendingMachine'],
        Graphs:      ['ParkingLot', 'VendingMachine'],
    };

    // ------------------------------------------------------------------
    // GET /api/scenarios/config
    // Admin page fetches this on load to restore the last-saved state.
    // Response: { success, scenarios: { Arrays: [...], ... }, updatedAt }
    // ------------------------------------------------------------------
    router.get('/config', async (req, res) => {
        try {
            const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID });

            return res.json({
                success:   true,
                scenarios: doc?.scenarios ?? DEFAULT_SCENARIOS,
                updatedAt: doc?.updatedAt ?? null,
            });
        } catch (err) {
            console.error('[scenarioRoutes] GET /config error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    // ------------------------------------------------------------------
    // POST /api/scenarios/config
    // Admin clicks "Push to App" — saves the full config to MongoDB.
    // Body: { scenarios: { Arrays: ["ParkingLot","VendingMachine"], ... } }
    // Response: { success: true }
    // ------------------------------------------------------------------
    router.post('/config', async (req, res) => {
        try {
            const { scenarios } = req.body;

            if (!scenarios || typeof scenarios !== 'object') {
                return res.status(400).json({ success: false, error: 'Invalid scenarios payload' });
            }

            await db.collection(COLLECTION).updateOne(
                { _id: DOC_ID },
                { $set: { scenarios, updatedAt: new Date() } },
                { upsert: true }
            );

            console.log('[scenarioRoutes] ✅ Config saved:', JSON.stringify(scenarios));
            return res.json({ success: true });
        } catch (err) {
            console.error('[scenarioRoutes] POST /config error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    // ------------------------------------------------------------------
    // GET /api/scenarios/active?ds=Arrays
    // Called by the Unity app on launch.
    // Returns the active scenario list for a specific data structure.
    // Response: { success: true, scenarios: ["ParkingLot", "VendingMachine"] }
    // ------------------------------------------------------------------
    router.get('/active', async (req, res) => {
        try {
            const ds = req.query.ds;

            if (!ds) {
                return res.status(400).json({ success: false, error: 'Missing ?ds= query parameter' });
            }

            const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID });
            const scenarios = doc?.scenarios?.[ds] ?? DEFAULT_SCENARIOS[ds] ?? ['ParkingLot', 'VendingMachine'];

            console.log(`[scenarioRoutes] GET /active?ds=${ds} → ${JSON.stringify(scenarios)}`);
            return res.json({ success: true, scenarios });
        } catch (err) {
            console.error('[scenarioRoutes] GET /active error:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};