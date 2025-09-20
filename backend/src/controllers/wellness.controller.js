// src/controllers/wellness.controller.js
const { WellnessTip } = require('../config/db');

// utility: simple hash from string -> integer
function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// seeded Fisher-Yates shuffle (non-destructive)
function seededShuffle(array, seed) {
  const a = array.slice();
  let random = seed >>> 0;
  // xorshift32 pseudo RNG
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

/**
 * GET /api/wellness/daily?date=YYYY-MM-DD&n=5
 * - date: optional date string, default = today (UTC date)
 * - n: how many tips to return (default 5)
 *
 * Behavior: deterministically shuffle list using date seed and return first n items.
 */
async function getDailyTip(req, res) {
  try {
    const n = Math.max(1, Math.min(20, parseInt(req.query.n, 10) || 5)); // clamp 1..20
    // default date = current UTC date in YYYY-MM-DD
    let dateParam = req.query.date;
    if (!dateParam) {
      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      dateParam = `${yyyy}-${mm}-${dd}`;
    }

    const tips = await WellnessTip.findAll({ order: [['id', 'ASC']] });
    if (!tips || tips.length === 0) return res.status(404).json({ message: 'No tips found' });

    // seed from date string (deterministic)
    const seed = hashStringToInt(dateParam);

    // seeded shuffle and take first n
    const shuffled = seededShuffle(tips, seed);
    const selection = shuffled.slice(0, Math.min(n, shuffled.length));

    return res.json({ date: dateParam, tips: selection, count: tips.length });
  } catch (err) {
    console.error('GET DAILY TIPS ERROR:', err);
    return res.status(500).json({ message: 'Error fetching daily tips' });
  }
}

module.exports = {
  getAllTips: async (req, res) => {
    try {
      const tips = await WellnessTip.findAll({ order: [['id', 'ASC']] });
      return res.json(tips);
    } catch (err) {
      console.error('GET ALL TIPS ERROR:', err);
      return res.status(500).json({ message: 'Error fetching tips' });
    }
  },
  getDailyTip
};
