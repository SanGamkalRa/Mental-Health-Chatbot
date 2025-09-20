// scripts/seedWellnessTips.js
const fs = require('fs');
const path = require('path');

function tryRequire(paths) {
  for (const p of paths) {
    try {
      const resolved = require.resolve(p);
      // require.resolve succeeded, so require it
      return require(p);
    } catch (err) {
      // keep trying
    }
    // try with .js appended if not present
    try {
      const pj = require.resolve(p + '.js');
      return require(p + '.js');
    } catch (err) {}
  }
  return null;
}

(async () => {
  try {
    // possible relative paths from scripts/ to your db file
    const candidatePaths = [
      path.resolve(__dirname, '../src/config/db'),      // scripts/ -> src/config/db
      path.resolve(__dirname, '../src/config/db.js'),
      path.resolve(__dirname, '../src/config/index'),   // in case config is a folder with index.js
      path.resolve(__dirname, '../src/config'),         // require folder index
      path.resolve(__dirname, '../../src/config/db'),   // if scripts folder is nested differently
      '../src/config/db',
      '../src/config/db.js',
      '../src/config',
      '../../src/config/db'
    ];

    // Debug print candidates
    console.log('Trying to locate db module. Candidates:');
    candidatePaths.forEach((p) => console.log('  ', p));

    // Try to require each candidate in Node-friendly way
    let db = null;
    // First try requiring by path strings (relative)
    const simpleCandidates = [
      path.join(__dirname, '..', 'src', 'config', 'db'),
      path.join(__dirname, '..', 'src', 'config', 'db.js'),
      path.join(__dirname, '..', 'src', 'config'),
      path.join(__dirname, '..', '..', 'src', 'config', 'db'),
      path.join(__dirname, '..', '..', 'src', 'config')
    ];

    for (const c of simpleCandidates) {
      try {
        // require accepts absolute paths too
        const abs = path.resolve(c);
        if (fs.existsSync(abs) || fs.existsSync(abs + '.js') || fs.existsSync(path.join(abs, 'index.js'))) {
          console.log('Requiring:', abs);
          db = require(abs);
          break;
        }
      } catch (err) {
        // continue
      }
    }

    // fallback: try plain relative requires
    if (!db) {
      db = tryRequire(['../src/config/db', '../src/config', '../../src/config/db', '../../src/config']);
    }

    if (!db) {
      console.error('\nERROR: Could not require your DB module. Check that src/config/db.js exists and exports the DB object.');
      console.error('Run `ls src/config` and check the exact filename and export (module.exports) in the db file.');
      process.exit(1);
    }

    // Ensure db has WellnessTip model
    if (!db.init || !db.WellnessTip) {
      console.log('db object loaded keys:', Object.keys(db));
      console.error('\nERROR: db module found but it does not export init() and WellnessTip. Ensure src/config/db.js exports { init, WellnessTip, sequelize, ... }');
      process.exit(1);
    }

    // init DB
    await db.init({ alter: true });
    const WellnessTip = db.WellnessTip;

    const tips = [
      { tip: "Take three deep diaphragmatic breaths when you feel overloaded.", category: "Breathing" },
      { tip: "Go for a 10-minute walk outside — sunlight and movement help mood.", category: "Movement" },
      { tip: "Write down three things you're grateful for today.", category: "Gratitude" },
      { tip: "Drink a full glass of water before your next snack.", category: "Hydration" },
      { tip: "Set a timer: work for 25 minutes, then take a 5-minute break (Pomodoro).", category: "Productivity" },
      { tip: "Do a quick body scan: notice tension, then relax each area.", category: "Mindfulness" },
      { tip: "Call or message one friend or family member to check in.", category: "Social" },
      { tip: "Prepare a healthy snack rich in protein to keep energy steady.", category: "Nutrition" },
      { tip: "Stand up and stretch for 2 minutes every hour.", category: "Movement" },
      { tip: "Limit screen time 30 minutes before sleep to improve rest.", category: "Sleep" },
      { tip: "Try journaling for 5–10 minutes to process emotions.", category: "Reflection" },
      { tip: "Practice progressive muscle relaxation for 5 minutes.", category: "Relaxation" },
      { tip: "Plan one thing to look forward to this week.", category: "Motivation" },
      { tip: "If you're anxious, name 5 things you can see, 4 you can touch, 3 you can hear.", category: "Grounding" },
      { tip: "Set a small, achievable goal for the next hour.", category: "Productivity" },
      { tip: "Listen to a short playlist that lifts your mood.", category: "Mood" },
      { tip: "Spend 5 minutes practicing mindful eating with a small snack.", category: "Mindfulness" },
      { tip: "Write one positive affirmation and repeat it aloud.", category: "Cognitive" },
      { tip: "Declutter one small area (a drawer or your desk) for a clearer mind.", category: "Environment" },
      { tip: "Try a 3-minute guided breathing app when stressed.", category: "Breathing" },
      { tip: "Do 10–15 squats or an easy set of exercises to boost energy.", category: "Movement" },
      { tip: "Schedule short 'do nothing' breaks — rest is productive.", category: "Rest" },
      { tip: "Turn off notifications for an hour to focus and reduce anxiety.", category: "Digital" },
      { tip: "Practice saying 'no' to one small request that drains you.", category: "Boundaries" },
      { tip: "Spend a few minutes tending a plant — it reduces stress.", category: "Nature" },
      { tip: "Try a simple guided meditation (5–10 minutes).", category: "Meditation" },
      { tip: "Write down any negative thought and reframe it into a balanced statement.", category: "Cognitive" },
      { tip: "Make a list of activities you enjoy and pick one for today.", category: "Pleasure" },
      { tip: "Take a brief nap (20 minutes) if you’re feeling exhausted.", category: "Rest" },
      { tip: "Practice gentle yoga or stretching for 10 minutes.", category: "Movement" },
      { tip: "Create a bedtime routine and go to bed 30 minutes earlier tonight.", category: "Sleep" },
      { tip: "Cook a simple meal — cooking can be therapeutic and nourishing.", category: "Nutrition" },
      { tip: "Limit alcohol & heavy caffeine if you’re feeling low or anxious.", category: "Substances" },
      { tip: "Set a small financial or organisational task to reduce stress.", category: "Life" },
      { tip: "Volunteer or help someone; small acts of kindness boost wellbeing.", category: "Social" }
    ];

    const existing = await WellnessTip.count();
    if (existing >= tips.length) {
      console.log(`Wellness tips already seeded (count=${existing}). Skipping insert.`);
    } else {
      for (const t of tips) {
        await WellnessTip.findOrCreate({
          where: { tip: t.tip },
          defaults: t
        });
      }
      const newCount = await WellnessTip.count();
      console.log(`Seeded wellness tips. total tips in DB: ${newCount}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Fatal seed error:', err);
    process.exit(1);
  }
})();
