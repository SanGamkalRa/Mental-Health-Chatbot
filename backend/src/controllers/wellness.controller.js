// src/controllers/wellness.dynamo.controller.js
const { ddbDocClient } = require('../lib/dynamoClient');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');

const WELLNESS_TABLE = process.env.WELLNESS_TABLE || 'wellness_tips';

// utility functions (same idea as your previous implementation)
function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededShuffle(array, seed) {
  const a = array.slice();
  let random = seed >>> 0;
  function rand() {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    return (random >>> 0) / 4294967295;
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Minimal in-memory fallback tips (same shape: tip + category)
const BUILTIN_TIPS = [
  { id: 't1', tip: 'Breathe: Take 5 deep slow breaths — in for 4, out for 6.', category: 'Breathing' },
  { id: 't2', tip: 'Move: Stand and stretch for 2 minutes to reset your body.', category: 'Movement' },
  { id: 't3', tip: 'Hydrate: Drink a glass of water — hydration helps mood and focus.', category: 'Hydration' },
  { id: 't4', tip: 'Gratitude: Name 3 things you’re grateful for right now.', category: 'Gratitude' },
  { id: 't5', tip: 'Micro-task: Pick one tiny task and finish it — momentum helps.', category: 'Productivity' },
  { id: 't6', tip: 'Walk: Go outside for a 10-minute walk if you can.', category: 'Movement' },
  { id: 't7', tip: 'Disconnect: Turn off notifications for 30 minutes and focus.', category: 'Digital' },
  { id: 't8', tip: 'Mindful Pause: Close your eyes and notice sensations for 60 seconds.', category: 'Mindfulness' },
  { id: 't9', tip: 'Connect: Send a short message to someone you care about.', category: 'Social' },
  { id: 't10', tip: 'Sleep Hygiene: Avoid screens 30 minutes before bed for better sleep.', category: 'Sleep' }
];

async function readAllTipsFromDynamo() {
  try {
    const out = await ddbDocClient.send(new ScanCommand({
      TableName: WELLNESS_TABLE,
      // optionally: ProjectionExpression: 'id, tip, category, createdAt'
    }));
    if (!out || !out.Items || out.Items.length === 0) {
      return [];
    }
    // Normalize items for the controller format: { id, tip, category, createdAt }
    return out.Items.map(it => ({
      id: it.id || (it.tip && it.tip.slice(0, 40)) || String(Math.random()).slice(2, 10),
      tip: it.tip || it.body || it.title || '',
      category: it.category || 'General',
      createdAt: it.createdAt || new Date().toISOString()
    }));
  } catch (err) {
    console.error('readAllTipsFromDynamo error:', err && err.message || err);
    // return empty to allow fallback to builtin tips
    return [];
  }
}

/**
 * GET /api/wellness/daily?date=YYYY-MM-DD&n=5
 */
async function getDailyTip(req, res) {
  try {
    const n = Math.max(1, Math.min(50, parseInt(req.query.n, 10) || 5));
    let dateParam = req.query.date;
    if (!dateParam) {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      dateParam = `${yyyy}-${mm}-${dd}`;
    }

    // read from dynamo
    const tips = await readAllTipsFromDynamo();
    const source = (tips && tips.length) ? tips : BUILTIN_TIPS;

    const seed = hashStringToInt(dateParam);
    const shuffled = seededShuffle(source, seed);
    const selection = shuffled.slice(0, Math.min(n, shuffled.length));

    return res.json({ date: dateParam, tips: selection, count: source.length });
  } catch (err) {
    console.error('getDailyTip error:', err && err.message || err);
    return res.status(500).json({ message: 'Error fetching daily tips' });
  }
}

async function getAllTips(req, res) {
  try {
    const tips = await readAllTipsFromDynamo();
    const result = (tips && tips.length) ? tips : BUILTIN_TIPS;
    return res.json(result);
  } catch (err) {
    console.error('getAllTips error:', err && err.message || err);
    return res.status(500).json({ message: 'Error fetching all tips' });
  }
}

module.exports = { getDailyTip, getAllTips };
