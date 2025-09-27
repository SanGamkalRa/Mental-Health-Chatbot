// scripts/seedWellnessTipsDynamo.js
// Robust Dynamo seeder: inspects table (GSI keys) and ensures required index attrs are present.
// Usage: WELLNESS_TABLE=wellness_tipps REGION=us-east-1 [DYNAMODB_ENDPOINT=http://localhost:8000] node scripts/seedWellnessTipsDynamo.js

const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE = process.env.WELLNESS_TABLE || "wellness_tips";
const REGION = process.env.REGION || "us-east-1";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || undefined;

const BASE_TIPS = [
  {
    "tip": "🧭 Break big assignments into smaller tasks and focus on one step at a time.",
    "category": "Productivity"
  },
  {
    "tip": "📚 Break big assignments into smaller tasks and focus on one step at a time.",
    "category": "Productivity"
  },
  {
    "tip": "🧭 Use Pomodoro: study for 60 minutes, then rest for 15 minutes.",
    "category": "Productivity"
  },
  {
    "tip": "📚 Use Pomodoro: study for 7 minutes, then rest for 10 minutes.",
    "category": "Productivity"
  },
  {
    "tip": "⏳ Use Pomodoro: study for 5 minutes, then rest for 3 minutes.",
    "category": "Productivity"
  },
  {
    "tip": "🧭 Start with a 2-minute task to overcome procrastination.",
    "category": "Productivity"
  },
  {
    "tip": "📚 Start with a 2-minute task to overcome procrastination.",
    "category": "Productivity"
  },
  {
    "tip": "📚 Identify your top 5 priorities for today before classes.",
    "category": "Productivity"
  },
  {
    "tip": "⏳ Identify your top 8 priorities for today before classes.",
    "category": "Productivity"
  },
  {
    "tip": "🧭 Identify your top 6 priorities for today before classes.",
    "category": "Productivity"
  },
  {
    "tip": "🧭 Batch similar tasks together (emails, lab prep, readings).",
    "category": "Productivity"
  },
  {
    "tip": "⏳ Batch similar tasks together (emails, lab prep, readings).",
    "category": "Productivity"
  },
  {
    "tip": "🧠 Review lecture notes within 12 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "📖 Review lecture notes within 4 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "📝 Review lecture notes within 4 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "📖 Teach a concept to a friend or to your notes in your own words.",
    "category": "Study"
  },
  {
    "tip": "🧠 Teach a concept to a friend or to your notes in your own words.",
    "category": "Study"
  },
  {
    "tip": "🧠 Make 10 quick flashcards for the toughest topic.",
    "category": "Study"
  },
  {
    "tip": "📝 Make 10 quick flashcards for the toughest topic.",
    "category": "Study"
  },
  {
    "tip": "📝 Skim tomorrow’s slides the night before for a head start.",
    "category": "Study"
  },
  {
    "tip": "📖 Do a 30-minute recall session without looking at notes.",
    "category": "Study"
  },
  {
    "tip": "📖 Do a 3-minute recall session without looking at notes.",
    "category": "Study"
  },
  {
    "tip": "📝 Do a 60-minute recall session without looking at notes.",
    "category": "Study"
  },
  {
    "tip": "📆 Map deadlines and exams in a digital calendar.",
    "category": "Organisation"
  },
  {
    "tip": "🧾 Map deadlines and exams in a digital calendar.",
    "category": "Organisation"
  },
  {
    "tip": "🗂️ Set reminders 1 hours before each class to prep materials.",
    "category": "Organisation"
  },
  {
    "tip": "🧾 Set reminders 2 hours before each class to prep materials.",
    "category": "Organisation"
  },
  {
    "tip": "📆 Set reminders 4 hours before each class to prep materials.",
    "category": "Organisation"
  },
  {
    "tip": "🗂️ Plan a weekly review every Sunday evening.",
    "category": "Organisation"
  },
  {
    "tip": "📆 Plan a weekly review every Monday evening.",
    "category": "Organisation"
  },
  {
    "tip": "📆 Plan a weekly review every Wednesday evening.",
    "category": "Organisation"
  },
  {
    "tip": "🗂️ Organize files into simple folders: Course → Week → Topic.",
    "category": "Organisation"
  },
  {
    "tip": "📆 Organize files into simple folders: Course → Week → Topic.",
    "category": "Organisation"
  },
  {
    "tip": "🧾 Keep a running to-do list and check off completed items.",
    "category": "Organisation"
  },
  {
    "tip": "🗂️ Keep a running to-do list and check off completed items.",
    "category": "Organisation"
  },
  {
    "tip": "🚶‍♂️ Take a brisk 60-minute walk between study blocks.",
    "category": "Movement"
  },
  {
    "tip": "🧘 Take a brisk 60-minute walk between study blocks.",
    "category": "Movement"
  },
  {
    "tip": "🏃 Take a brisk 45-minute walk between study blocks.",
    "category": "Movement"
  },
  {
    "tip": "🚶‍♂️ Stretch your back and shoulders every 15 minutes of sitting.",
    "category": "Movement"
  },
  {
    "tip": "🏃 Stretch your back and shoulders every 30 minutes of sitting.",
    "category": "Movement"
  },
  {
    "tip": "🧘 Stretch your back and shoulders every 5 minutes of sitting.",
    "category": "Movement"
  },
  {
    "tip": "🏃 Do 4 bodyweight squats to boost energy.",
    "category": "Movement"
  },
  {
    "tip": "🧘 Do 10 bodyweight squats to boost energy.",
    "category": "Movement"
  },
  {
    "tip": "🏃 Do 5 bodyweight squats to boost energy.",
    "category": "Movement"
  },
  {
    "tip": "🧘 Walk a different route on campus to refresh your mind.",
    "category": "Movement"
  },
  {
    "tip": "🚶‍♂️ Walk a different route on campus to refresh your mind.",
    "category": "Movement"
  },
  {
    "tip": "🧘 Do a quick desk stretch routine for neck and wrists.",
    "category": "Movement"
  },
  {
    "tip": "🚶‍♂️ Do a quick desk stretch routine for neck and wrists.",
    "category": "Movement"
  },
  {
    "tip": "🏃 Do a quick desk stretch routine for neck and wrists.",
    "category": "Movement"
  },
  {
    "tip": "🌬️ Practice box breathing: inhale 4, hold 4, exhale 4, hold 4.",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Practice box breathing: inhale 8, hold 8, exhale 8, hold 8.",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Practice box breathing: inhale 5, hold 5, exhale 5, hold 5.",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Try 4-7-8 breathing to reduce anxiety before exams.",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Try 4-7-8 breathing to reduce anxiety before exams.",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Take 3 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Take 8 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Take 4 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Exhale longer than you inhale for quick calm (e.g., 4 in, 6 out).",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Exhale longer than you inhale for quick calm (e.g., 4 in, 6 out).",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Pause for 30 minutes to breathe with your hand on your belly.",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Pause for 10 minutes to breathe with your hand on your belly.",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Pause for 25 minutes to breathe with your hand on your belly.",
    "category": "Breathing"
  },
  {
    "tip": "🧘 Do a 20-minute guided mindfulness practice before studying.",
    "category": "Mindfulness"
  },
  {
    "tip": "😌 Do a 7-minute guided mindfulness practice before studying.",
    "category": "Mindfulness"
  },
  {
    "tip": "🧘 Do a 7-minute guided mindfulness practice before studying.",
    "category": "Mindfulness"
  },
  {
    "tip": "🗒️ Write a quick brain dump to clear mental clutter.",
    "category": "Mindfulness"
  },
  {
    "tip": "🧘 Notice 3 things you can see, 2 you can hear, 1 you can feel.",
    "category": "Mindfulness"
  },
  {
    "tip": "😌 Notice 3 things you can see, 2 you can hear, 1 you can feel.",
    "category": "Mindfulness"
  },
  {
    "tip": "🧘 Mindfully eat a small snack, noticing taste and texture.",
    "category": "Mindfulness"
  },
  {
    "tip": "😌 Mindfully eat a small snack, noticing taste and texture.",
    "category": "Mindfulness"
  },
  {
    "tip": "🧘 Set a mindful intention for this study block.",
    "category": "Mindfulness"
  },
  {
    "tip": "🗒️ Set a mindful intention for this study block.",
    "category": "Mindfulness"
  },
  {
    "tip": "🔑 Reframe a negative thought into a balanced statement.",
    "category": "Cognitive"
  },
  {
    "tip": "🧩 Reframe a negative thought into a balanced statement.",
    "category": "Cognitive"
  },
  {
    "tip": "💭 Replace “I can’t” with “I can learn this step by step.”",
    "category": "Cognitive"
  },
  {
    "tip": "🔑 Replace “I can’t” with “I can learn this step by step.”",
    "category": "Cognitive"
  },
  {
    "tip": "💭 Talk to yourself as you would to a close friend.",
    "category": "Cognitive"
  },
  {
    "tip": "🧩 Talk to yourself as you would to a close friend.",
    "category": "Cognitive"
  },
  {
    "tip": "🧩 Write down the worry and identify what you can control.",
    "category": "Cognitive"
  },
  {
    "tip": "🔑 Write down the worry and identify what you can control.",
    "category": "Cognitive"
  },
  {
    "tip": "🔑 Use affirmations: “I am capable; effort grows my skills.”",
    "category": "Cognitive"
  },
  {
    "tip": "💭 Use affirmations: “I am capable; effort grows my skills.”",
    "category": "Cognitive"
  },
  {
    "tip": "🌟 Write down 7 things you’re grateful for today.",
    "category": "Gratitude"
  },
  {
    "tip": "🙏 Write down 6 things you’re grateful for today.",
    "category": "Gratitude"
  },
  {
    "tip": "🌟 Write down 3 things you’re grateful for today.",
    "category": "Gratitude"
  },
  {
    "tip": "🙏 Send a thank-you message to someone who helped you.",
    "category": "Gratitude"
  },
  {
    "tip": "🌟 Send a thank-you message to someone who helped you.",
    "category": "Gratitude"
  },
  {
    "tip": "🙏 Notice one small joy from campus life today.",
    "category": "Gratitude"
  },
  {
    "tip": "🌟 Start a gratitude note in your planner.",
    "category": "Gratitude"
  },
  {
    "tip": "🙏 Start a gratitude note in your planner.",
    "category": "Gratitude"
  },
  {
    "tip": "🙏 Take a photo of something that made you smile.",
    "category": "Gratitude"
  },
  {
    "tip": "🌟 Take a photo of something that made you smile.",
    "category": "Gratitude"
  },
  {
    "tip": "🎯 Celebrate small wins — progress over perfection.",
    "category": "Motivation"
  },
  {
    "tip": "🎉 Celebrate small wins — progress over perfection.",
    "category": "Motivation"
  },
  {
    "tip": "🎯 Track your study time and reward streaks.",
    "category": "Motivation"
  },
  {
    "tip": "📊 Track your study time and reward streaks.",
    "category": "Motivation"
  },
  {
    "tip": "🎉 Track your study time and reward streaks.",
    "category": "Motivation"
  },
  {
    "tip": "🎉 Visualize finishing your next milestone with pride.",
    "category": "Motivation"
  },
  {
    "tip": "📊 Visualize finishing your next milestone with pride.",
    "category": "Motivation"
  },
  {
    "tip": "🎯 Write a supportive note to your future self.",
    "category": "Motivation"
  },
  {
    "tip": "🎉 Write a supportive note to your future self.",
    "category": "Motivation"
  },
  {
    "tip": "📊 Write a supportive note to your future self.",
    "category": "Motivation"
  },
  {
    "tip": "📊 Set a fun reward after submitting your assignment.",
    "category": "Motivation"
  },
  {
    "tip": "🎉 Set a fun reward after submitting your assignment.",
    "category": "Motivation"
  },
  {
    "tip": "🎯 Set a fun reward after submitting your assignment.",
    "category": "Motivation"
  },
  {
    "tip": "🚰 Drink a full glass of water before your next snack.",
    "category": "Hydration"
  },
  {
    "tip": "💧 Drink a full glass of water before your next snack.",
    "category": "Hydration"
  },
  {
    "tip": "💧 Keep a bottle at your desk and sip every 5 minutes.",
    "category": "Hydration"
  },
  {
    "tip": "🚰 Keep a bottle at your desk and sip every 20 minutes.",
    "category": "Hydration"
  },
  {
    "tip": "🚰 Keep a bottle at your desk and sip every 10 minutes.",
    "category": "Hydration"
  },
  {
    "tip": "🚰 Add a slice of lemon or fruit to make water inviting.",
    "category": "Hydration"
  },
  {
    "tip": "💧 Drink water after each restroom break to build the habit.",
    "category": "Hydration"
  },
  {
    "tip": "🚰 Drink water after each restroom break to build the habit.",
    "category": "Hydration"
  },
  {
    "tip": "💧 Set a hydration reminder on your phone.",
    "category": "Hydration"
  },
  {
    "tip": "🍎 Pack protein-rich snacks (nuts, yogurt, eggs) for steady energy.",
    "category": "Nutrition"
  },
  {
    "tip": "🥗 Pack protein-rich snacks (nuts, yogurt, eggs) for steady energy.",
    "category": "Nutrition"
  },
  {
    "tip": "🍽️ Pack protein-rich snacks (nuts, yogurt, eggs) for steady energy.",
    "category": "Nutrition"
  },
  {
    "tip": "🍽️ Don’t skip breakfast — it supports focus and mood.",
    "category": "Nutrition"
  },
  {
    "tip": "🥗 Don’t skip breakfast — it supports focus and mood.",
    "category": "Nutrition"
  },
  {
    "tip": "🍎 Plan simple balanced meals for exam week.",
    "category": "Nutrition"
  },
  {
    "tip": "🍽️ Plan simple balanced meals for exam week.",
    "category": "Nutrition"
  },
  {
    "tip": "🍎 Eat a piece of fruit with every study break.",
    "category": "Nutrition"
  },
  {
    "tip": "🍎 Choose whole grains for longer-lasting energy.",
    "category": "Nutrition"
  },
  {
    "tip": "🍽️ Choose whole grains for longer-lasting energy.",
    "category": "Nutrition"
  },
  {
    "tip": "🥗 Choose whole grains for longer-lasting energy.",
    "category": "Nutrition"
  },
  {
    "tip": "🛌 Go to bed 7 minutes earlier tonight.",
    "category": "Sleep"
  },
  {
    "tip": "😴 Go to bed 3 minutes earlier tonight.",
    "category": "Sleep"
  },
  {
    "tip": "🌙 Go to bed 60 minutes earlier tonight.",
    "category": "Sleep"
  },
  {
    "tip": "🌙 Limit screens 10 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🌙 Limit screens 5 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🛌 Limit screens 3 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🛌 Keep your room cool, dark, and quiet for better sleep.",
    "category": "Sleep"
  },
  {
    "tip": "🌙 Keep your room cool, dark, and quiet for better sleep.",
    "category": "Sleep"
  },
  {
    "tip": "😴 Keep your room cool, dark, and quiet for better sleep.",
    "category": "Sleep"
  },
  {
    "tip": "😴 Maintain a consistent wake-up time, even on weekends.",
    "category": "Sleep"
  },
  {
    "tip": "🌙 Maintain a consistent wake-up time, even on weekends.",
    "category": "Sleep"
  },
  {
    "tip": "🛌 Do a wind-down routine: stretch, dim lights, read.",
    "category": "Sleep"
  },
  {
    "tip": "📵 Take a 3-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "📵 Take a 12-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "📱 Take a 25-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "📵 Silence notifications during study blocks.",
    "category": "Digital"
  },
  {
    "tip": "📱 Silence notifications during study blocks.",
    "category": "Digital"
  },
  {
    "tip": "📵 Move distracting apps off your home screen.",
    "category": "Digital"
  },
  {
    "tip": "📱 Move distracting apps off your home screen.",
    "category": "Digital"
  },
  {
    "tip": "📱 Use website blockers during revision.",
    "category": "Digital"
  },
  {
    "tip": "📵 Unsubscribe from spammy emails to declutter.",
    "category": "Digital"
  },
  {
    "tip": "📱 Unsubscribe from spammy emails to declutter.",
    "category": "Digital"
  },
  {
    "tip": "🕯️ Declutter your desk for a clearer mind.",
    "category": "Environment"
  },
  {
    "tip": "🪑 Declutter your desk for a clearer mind.",
    "category": "Environment"
  },
  {
    "tip": "🧹 Study near natural light or a window.",
    "category": "Environment"
  },
  {
    "tip": "🕯️ Study near natural light or a window.",
    "category": "Environment"
  },
  {
    "tip": "🧹 Use a pleasant scent or candle during study time.",
    "category": "Environment"
  },
  {
    "tip": "🕯️ Use a pleasant scent or candle during study time.",
    "category": "Environment"
  },
  {
    "tip": "🪑 Keep only essentials on your desk during focus blocks.",
    "category": "Environment"
  },
  {
    "tip": "🕯️ Keep only essentials on your desk during focus blocks.",
    "category": "Environment"
  },
  {
    "tip": "🕯️ Add a small plant to your study area.",
    "category": "Environment"
  },
  {
    "tip": "🧹 Add a small plant to your study area.",
    "category": "Environment"
  },
  {
    "tip": "🌤️ Get 3 minutes of sunlight or fresh air today.",
    "category": "Nature"
  },
  {
    "tip": "🌿 Get 20 minutes of sunlight or fresh air today.",
    "category": "Nature"
  },
  {
    "tip": "🌤️ Get 12 minutes of sunlight or fresh air today.",
    "category": "Nature"
  },
  {
    "tip": "🪴 Sit under a tree and take 7 slow breaths.",
    "category": "Nature"
  },
  {
    "tip": "🌤️ Sit under a tree and take 4 slow breaths.",
    "category": "Nature"
  },
  {
    "tip": "🌿 Sit under a tree and take 4 slow breaths.",
    "category": "Nature"
  },
  {
    "tip": "🌤️ Take a mindful walk and notice colors around you.",
    "category": "Nature"
  },
  {
    "tip": "🌿 Take a mindful walk and notice colors around you.",
    "category": "Nature"
  },
  {
    "tip": "🪴 Take a mindful walk and notice colors around you.",
    "category": "Nature"
  },
  {
    "tip": "🌤️ Open a window and listen to outdoor sounds for a minute.",
    "category": "Nature"
  },
  {
    "tip": "🪴 Open a window and listen to outdoor sounds for a minute.",
    "category": "Nature"
  },
  {
    "tip": "🌿 Do a short walk after lunch for digestion and calm.",
    "category": "Nature"
  },
  {
    "tip": "🌤️ Do a short walk after lunch for digestion and calm.",
    "category": "Nature"
  },
  {
    "tip": "🛁 Take a 15-minute power nap if you’re exhausted.",
    "category": "Rest"
  },
  {
    "tip": "🧸 Take a 60-minute power nap if you’re exhausted.",
    "category": "Rest"
  },
  {
    "tip": "🧸 Schedule a guilt-free break after finishing a task.",
    "category": "Rest"
  },
  {
    "tip": "🛀 Schedule a guilt-free break after finishing a task.",
    "category": "Rest"
  },
  {
    "tip": "🛁 Put on comfy clothes to signal rest time.",
    "category": "Rest"
  },
  {
    "tip": "🧸 Put on comfy clothes to signal rest time.",
    "category": "Rest"
  },
  {
    "tip": "🛀 Do nothing for 3 minutes — just breathe and notice.",
    "category": "Rest"
  },
  {
    "tip": "🛁 Do nothing for 3 minutes — just breathe and notice.",
    "category": "Rest"
  },
  {
    "tip": "🧸 Do nothing for 3 minutes — just breathe and notice.",
    "category": "Rest"
  },
  {
    "tip": "🛁 Lie down and do a gentle body scan.",
    "category": "Rest"
  },
  {
    "tip": "🛀 Lie down and do a gentle body scan.",
    "category": "Rest"
  },
  {
    "tip": "🕯️ Take a warm shower to ease tension.",
    "category": "Relaxation"
  },
  {
    "tip": "🎐 Take a warm shower to ease tension.",
    "category": "Relaxation"
  },
  {
    "tip": "🕯️ Listen to calming music for 12 minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🛀 Listen to calming music for 3 minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🛀 Listen to calming music for 45 minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🎐 Try progressive muscle relaxation from toes to head.",
    "category": "Relaxation"
  },
  {
    "tip": "🕯️ Try progressive muscle relaxation from toes to head.",
    "category": "Relaxation"
  },
  {
    "tip": "🕯️ Color, doodle, or do a simple craft for unwinding.",
    "category": "Relaxation"
  },
  {
    "tip": "🎐 Color, doodle, or do a simple craft for unwinding.",
    "category": "Relaxation"
  },
  {
    "tip": "🛀 Color, doodle, or do a simple craft for unwinding.",
    "category": "Relaxation"
  },
  {
    "tip": "🛀 Use a heat pack on tight shoulders for a few minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🕯️ Use a heat pack on tight shoulders for a few minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🤝 Message a classmate to discuss today’s lecture.",
    "category": "Social"
  },
  {
    "tip": "📞 Message a classmate to discuss today’s lecture.",
    "category": "Social"
  },
  {
    "tip": "👥 Call a friend or family member for a quick check-in.",
    "category": "Social"
  },
  {
    "tip": "🤝 Invite someone to a shared study session.",
    "category": "Social"
  },
  {
    "tip": "📞 Invite someone to a shared study session.",
    "category": "Social"
  },
  {
    "tip": "👥 Invite someone to a shared study session.",
    "category": "Social"
  },
  {
    "tip": "🤝 Plan a short coffee catch-up after class.",
    "category": "Social"
  },
  {
    "tip": "📞 Plan a short coffee catch-up after class.",
    "category": "Social"
  },
  {
    "tip": "📞 Send an encouraging message to a peer.",
    "category": "Social"
  },
  {
    "tip": "🤝 Send an encouraging message to a peer.",
    "category": "Social"
  },
  {
    "tip": "👥 Send an encouraging message to a peer.",
    "category": "Social"
  },
  {
    "tip": "🧑‍🏫 Email your tutor about a confusing topic early.",
    "category": "Support"
  },
  {
    "tip": "💬 Email your tutor about a confusing topic early.",
    "category": "Support"
  },
  {
    "tip": "🧑‍🏫 Book a student counselling session if overwhelmed.",
    "category": "Support"
  },
  {
    "tip": "💬 Book a student counselling session if overwhelmed.",
    "category": "Support"
  },
  {
    "tip": "💬 Visit office hours with one clear question.",
    "category": "Support"
  },
  {
    "tip": "🧑‍⚕️ Visit office hours with one clear question.",
    "category": "Support"
  },
  {
    "tip": "🧑‍🏫 Use peer mentoring or academic skills workshops.",
    "category": "Support"
  },
  {
    "tip": "💬 Use peer mentoring or academic skills workshops.",
    "category": "Support"
  },
  {
    "tip": "🧑‍🏫 Ask library staff for research help on your topic.",
    "category": "Support"
  },
  {
    "tip": "💬 Ask library staff for research help on your topic.",
    "category": "Support"
  },
  {
    "tip": "🤗 Attend one campus event this week to connect.",
    "category": "Community"
  },
  {
    "tip": "🎟️ Attend one campus event this week to connect.",
    "category": "Community"
  },
  {
    "tip": "🏛️ Join a club aligned with your interests.",
    "category": "Community"
  },
  {
    "tip": "🎟️ Join a club aligned with your interests.",
    "category": "Community"
  },
  {
    "tip": "🎟️ Volunteer an hour — helping boosts wellbeing.",
    "category": "Community"
  },
  {
    "tip": "🏛️ Volunteer an hour — helping boosts wellbeing.",
    "category": "Community"
  },
  {
    "tip": "🎟️ Say hello to someone new in your class today.",
    "category": "Community"
  },
  {
    "tip": "🤗 Say hello to someone new in your class today.",
    "category": "Community"
  },
  {
    "tip": "🏛️ Say hello to someone new in your class today.",
    "category": "Community"
  },
  {
    "tip": "🤗 Share study resources in your course forum.",
    "category": "Community"
  },
  {
    "tip": "🏛️ Share study resources in your course forum.",
    "category": "Community"
  },
  {
    "tip": "🪧 Say no to one non-essential request this week.",
    "category": "Boundaries"
  },
  {
    "tip": "🪧 Protect a daily 30-minute focus block on your calendar.",
    "category": "Boundaries"
  },
  {
    "tip": "🛑 Protect a daily 15-minute focus block on your calendar.",
    "category": "Boundaries"
  },
  {
    "tip": "🪧 Protect a daily 60-minute focus block on your calendar.",
    "category": "Boundaries"
  },
  {
    "tip": "🪧 Turn off notifications after 2:00 pm for rest.",
    "category": "Boundaries"
  },
  {
    "tip": "🪧 Turn off notifications after 1:00 pm for rest.",
    "category": "Boundaries"
  },
  {
    "tip": "🆘 Turn off notifications after 4:00 pm for rest.",
    "category": "Boundaries"
  },
  {
    "tip": "🪧 Set clear study hours and stick to them.",
    "category": "Boundaries"
  },
  {
    "tip": "🆘 Set clear study hours and stick to them.",
    "category": "Boundaries"
  },
  {
    "tip": "🛑 Take breaks before you feel burned out.",
    "category": "Boundaries"
  },
  {
    "tip": "🆘 Take breaks before you feel burned out.",
    "category": "Boundaries"
  },
  {
    "tip": "🌟 Plan one enjoyable activity for this weekend.",
    "category": "Balance"
  },
  {
    "tip": "⚖️ Mix hard and easy tasks to keep momentum.",
    "category": "Balance"
  },
  {
    "tip": "🌟 Mix hard and easy tasks to keep momentum.",
    "category": "Balance"
  },
  {
    "tip": "🌟 Alternate quiet study with social time for balance.",
    "category": "Balance"
  },
  {
    "tip": "⚖️ Alternate quiet study with social time for balance.",
    "category": "Balance"
  },
  {
    "tip": "🌟 Schedule screen-free time after dinner.",
    "category": "Balance"
  },
  {
    "tip": "⚖️ Schedule screen-free time after dinner.",
    "category": "Balance"
  },
  {
    "tip": "🌟 Keep one evening free for rest each week.",
    "category": "Balance"
  },
  {
    "tip": "⚖️ Keep one evening free for rest each week.",
    "category": "Balance"
  },
  {
    "tip": "🎧 Read a non-academic book for 45 minutes.",
    "category": "Pleasure"
  },
  {
    "tip": "🎧 Read a non-academic book for 5 minutes.",
    "category": "Pleasure"
  },
  {
    "tip": "🎨 Watch a short inspiring talk or video.",
    "category": "Pleasure"
  },
  {
    "tip": "🎧 Watch a short inspiring talk or video.",
    "category": "Pleasure"
  },
  {
    "tip": "🎧 Play a favorite song and move with it.",
    "category": "Pleasure"
  },
  {
    "tip": "🎨 Play a favorite song and move with it.",
    "category": "Pleasure"
  },
  {
    "tip": "🎧 Cook a simple comforting meal tonight.",
    "category": "Pleasure"
  },
  {
    "tip": "🎨 Cook a simple comforting meal tonight.",
    "category": "Pleasure"
  },
  {
    "tip": "🎮 Spend 10 minutes on a hobby you enjoy.",
    "category": "Pleasure"
  },
  {
    "tip": "🎧 Spend 10 minutes on a hobby you enjoy.",
    "category": "Pleasure"
  },
  {
    "tip": "🔔 Try a 30-minute guided meditation.",
    "category": "Meditation"
  },
  {
    "tip": "🔔 Try a 25-minute guided meditation.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Try a 25-minute guided meditation.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Count 7 breaths, softly saying ‘in’ and ‘out’.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Count 3 breaths, softly saying ‘in’ and ‘out’.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Count 4 breaths, softly saying ‘in’ and ‘out’.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Focus attention on sounds for 2 minutes.",
    "category": "Meditation"
  },
  {
    "tip": "🔔 Focus attention on sounds for 2 minutes.",
    "category": "Meditation"
  },
  {
    "tip": "🔔 Repeat a calming mantra for a few minutes.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Repeat a calming mantra for a few minutes.",
    "category": "Meditation"
  },
  {
    "tip": "🔔 Do a compassion meditation: wish others well.",
    "category": "Meditation"
  },
  {
    "tip": "🧘 Do a compassion meditation: wish others well.",
    "category": "Meditation"
  },
  {
    "tip": "🧑‍💼 Do one small admin task you’ve been avoiding.",
    "category": "Life"
  },
  {
    "tip": "💼 Do one small admin task you’ve been avoiding.",
    "category": "Life"
  },
  {
    "tip": "📝 Do one small admin task you’ve been avoiding.",
    "category": "Life"
  },
  {
    "tip": "💼 Tidy one drawer for a quick sense of control.",
    "category": "Life"
  },
  {
    "tip": "🧑‍💼 Tidy one drawer for a quick sense of control.",
    "category": "Life"
  },
  {
    "tip": "🧑‍💼 Write a simple budget for the week.",
    "category": "Life"
  },
  {
    "tip": "📝 Write a simple budget for the week.",
    "category": "Life"
  },
  {
    "tip": "🧑‍💼 Prepare your bag the night before classes.",
    "category": "Life"
  },
  {
    "tip": "📝 Prepare your bag the night before classes.",
    "category": "Life"
  },
  {
    "tip": "🧑‍💼 Plan your transport to campus to reduce rush.",
    "category": "Life"
  },
  {
    "tip": "📝 Plan your transport to campus to reduce rush.",
    "category": "Life"
  },
  {
    "tip": "🛑 Set clear study hours and stick to them.",
    "category": "Boundaries"
  },
  {
    "tip": "🧸 Lie down and do a gentle body scan.",
    "category": "Rest"
  },
  {
    "tip": "💼 Write a simple budget for the week.",
    "category": "Life"
  },
  {
    "tip": "📝 Review lecture notes within 12 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "🤗 Join a club aligned with your interests.",
    "category": "Community"
  },
  {
    "tip": "🛌 Go to bed 5 minutes earlier tonight.",
    "category": "Sleep"
  },
  {
    "tip": "🛌 Go to bed 60 minutes earlier tonight.",
    "category": "Sleep"
  },
  {
    "tip": "🛑 Turn off notifications after 2:00 pm for rest.",
    "category": "Boundaries"
  },
  {
    "tip": "🧑‍⚕️ Ask library staff for research help on your topic.",
    "category": "Support"
  },
  {
    "tip": "😴 Limit screens 12 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🌟 Notice one small joy from campus life today.",
    "category": "Gratitude"
  },
  {
    "tip": "🛑 Say no to one non-essential request this week.",
    "category": "Boundaries"
  },
  {
    "tip": "😴 Limit screens 20 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🧹 Keep only essentials on your desk during focus blocks.",
    "category": "Environment"
  },
  {
    "tip": "💼 Prepare your bag the night before classes.",
    "category": "Life"
  },
  {
    "tip": "🧹 Declutter your desk for a clearer mind.",
    "category": "Environment"
  },
  {
    "tip": "⏳ Identify your top 6 priorities for today before classes.",
    "category": "Productivity"
  },
  {
    "tip": "📵 Take a 25-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "🛑 Protect a daily 12-minute focus block on your calendar.",
    "category": "Boundaries"
  },
  {
    "tip": "🧩 Use affirmations: “I am capable; effort grows my skills.”",
    "category": "Cognitive"
  },
  {
    "tip": "🍎 Don’t skip breakfast — it supports focus and mood.",
    "category": "Nutrition"
  },
  {
    "tip": "🪴 Get 7 minutes of sunlight or fresh air today.",
    "category": "Nature"
  },
  {
    "tip": "📝 Review lecture notes within 1 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "🛌 Maintain a consistent wake-up time, even on weekends.",
    "category": "Sleep"
  },
  {
    "tip": "🎮 Watch a short inspiring talk or video.",
    "category": "Pleasure"
  },
  {
    "tip": "🧠 Skim tomorrow’s slides the night before for a head start.",
    "category": "Study"
  },
  {
    "tip": "🧑‍🏫 Visit office hours with one clear question.",
    "category": "Support"
  },
  {
    "tip": "🛀 Listen to calming music for 5 minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🚰 Set a hydration reminder on your phone.",
    "category": "Hydration"
  },
  {
    "tip": "🗂️ Map deadlines and exams in a digital calendar.",
    "category": "Organisation"
  },
  {
    "tip": "🫁 Practice box breathing: inhale 7, hold 7, exhale 7, hold 7.",
    "category": "Breathing"
  },
  {
    "tip": "🧘 Stretch your back and shoulders every 12 minutes of sitting.",
    "category": "Movement"
  },
  {
    "tip": "🫁 Practice box breathing: inhale 8, hold 8, exhale 8, hold 8.",
    "category": "Breathing"
  },
  {
    "tip": "📝 Review lecture notes within 3 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "🌬️ Take 4 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🌬️ Take 6 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🧘 Do a 45-minute guided mindfulness practice before studying.",
    "category": "Mindfulness"
  },
  {
    "tip": "🧠 Do a 45-minute recall session without looking at notes.",
    "category": "Study"
  },
  {
    "tip": "📝 Do a 7-minute recall session without looking at notes.",
    "category": "Study"
  },
  {
    "tip": "🧾 Set reminders 12 hours before each class to prep materials.",
    "category": "Organisation"
  },
  {
    "tip": "💭 Write down the worry and identify what you can control.",
    "category": "Cognitive"
  },
  {
    "tip": "🧘 Do a 15-minute guided mindfulness practice before studying.",
    "category": "Mindfulness"
  },
  {
    "tip": "🚶‍♂️ Take a brisk 25-minute walk between study blocks.",
    "category": "Movement"
  },
  {
    "tip": "📵 Use website blockers during revision.",
    "category": "Digital"
  },
  {
    "tip": "📆 Plan a weekly review every Sunday evening.",
    "category": "Organisation"
  },
  {
    "tip": "🗒️ Mindfully eat a small snack, noticing taste and texture.",
    "category": "Mindfulness"
  },
  {
    "tip": "🌬️ Take 10 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🛀 Put on comfy clothes to signal rest time.",
    "category": "Rest"
  },
  {
    "tip": "🏃 Walk a different route on campus to refresh your mind.",
    "category": "Movement"
  },
  {
    "tip": "🎮 Cook a simple comforting meal tonight.",
    "category": "Pleasure"
  },
  {
    "tip": "🗂️ Plan a weekly review every Wednesday evening.",
    "category": "Organisation"
  },
  {
    "tip": "🛀 Try progressive muscle relaxation from toes to head.",
    "category": "Relaxation"
  },
  {
    "tip": "📱 Take a 5-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "🍽️ Eat a piece of fruit with every study break.",
    "category": "Nutrition"
  },
  {
    "tip": "⏳ Start with a 2-minute task to overcome procrastination.",
    "category": "Productivity"
  },
  {
    "tip": "🛌 Limit screens 20 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🫁 Practice box breathing: inhale 3, hold 3, exhale 3, hold 3.",
    "category": "Breathing"
  },
  {
    "tip": "📝 Teach a concept to a friend or to your notes in your own words.",
    "category": "Study"
  },
  {
    "tip": "🕯️ Listen to calming music for 3 minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🧸 Take a 7-minute power nap if you’re exhausted.",
    "category": "Rest"
  },
  {
    "tip": "📵 Take a 10-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "📆 Keep a running to-do list and check off completed items.",
    "category": "Organisation"
  },
  {
    "tip": "👥 Plan a short coffee catch-up after class.",
    "category": "Social"
  },
  {
    "tip": "🔔 Try a 60-minute guided meditation.",
    "category": "Meditation"
  },
  {
    "tip": "🪴 Get 20 minutes of sunlight or fresh air today.",
    "category": "Nature"
  },
  {
    "tip": "🌙 Limit screens 25 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🏃 Take a brisk 60-minute walk between study blocks.",
    "category": "Movement"
  },
  {
    "tip": "🪴 Sit under a tree and take 10 slow breaths.",
    "category": "Nature"
  },
  {
    "tip": "🎯 Visualize finishing your next milestone with pride.",
    "category": "Motivation"
  },
  {
    "tip": "🧾 Plan a weekly review every Wednesday evening.",
    "category": "Organisation"
  },
  {
    "tip": "⚖️ Plan one enjoyable activity for this weekend.",
    "category": "Balance"
  },
  {
    "tip": "🎮 Play a favorite song and move with it.",
    "category": "Pleasure"
  },
  {
    "tip": "📖 Review lecture notes within 2 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "⏳ Break big assignments into smaller tasks and focus on one step at a time.",
    "category": "Productivity"
  },
  {
    "tip": "🎐 Use a heat pack on tight shoulders for a few minutes.",
    "category": "Relaxation"
  },
  {
    "tip": "🔔 Count 6 breaths, softly saying ‘in’ and ‘out’.",
    "category": "Meditation"
  },
  {
    "tip": "🎧 Read a non-academic book for 20 minutes.",
    "category": "Pleasure"
  },
  {
    "tip": "🥗 Plan simple balanced meals for exam week.",
    "category": "Nutrition"
  },
  {
    "tip": "🤝 Call a friend or family member for a quick check-in.",
    "category": "Social"
  },
  {
    "tip": "🗂️ Plan a weekly review every Friday evening.",
    "category": "Organisation"
  },
  {
    "tip": "🌬️ Take 7 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "📱 Take a 3-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "💧 Keep a bottle at your desk and sip every 30 minutes.",
    "category": "Hydration"
  },
  {
    "tip": "🛁 Take a 60-minute power nap if you’re exhausted.",
    "category": "Rest"
  },
  {
    "tip": "🗂️ Set reminders 12 hours before each class to prep materials.",
    "category": "Organisation"
  },
  {
    "tip": "🏃 Do 10 bodyweight squats to boost energy.",
    "category": "Movement"
  },
  {
    "tip": "🫁 Take 6 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🪧 Turn off notifications after 4:00 pm for rest.",
    "category": "Boundaries"
  },
  {
    "tip": "🗒️ Do a 30-minute guided mindfulness practice before studying.",
    "category": "Mindfulness"
  },
  {
    "tip": "🌟 Write down 6 things you’re grateful for today.",
    "category": "Gratitude"
  },
  {
    "tip": "📞 Call a friend or family member for a quick check-in.",
    "category": "Social"
  },
  {
    "tip": "🤗 Volunteer an hour — helping boosts wellbeing.",
    "category": "Community"
  },
  {
    "tip": "🚰 Keep a bottle at your desk and sip every 7 minutes.",
    "category": "Hydration"
  },
  {
    "tip": "🫁 Take 10 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🛀 Take a warm shower to ease tension.",
    "category": "Relaxation"
  },
  {
    "tip": "🧘 Stretch your back and shoulders every 7 minutes of sitting.",
    "category": "Movement"
  },
  {
    "tip": "🌙 Do a wind-down routine: stretch, dim lights, read.",
    "category": "Sleep"
  },
  {
    "tip": "🛁 Schedule a guilt-free break after finishing a task.",
    "category": "Rest"
  },
  {
    "tip": "🏃 Do 7 bodyweight squats to boost energy.",
    "category": "Movement"
  },
  {
    "tip": "🫁 Pause for 3 minutes to breathe with your hand on your belly.",
    "category": "Breathing"
  },
  {
    "tip": "📆 Set reminders 3 hours before each class to prep materials.",
    "category": "Organisation"
  },
  {
    "tip": "🆘 Say no to one non-essential request this week.",
    "category": "Boundaries"
  },
  {
    "tip": "📱 Take a 60-minute social media detox to be present.",
    "category": "Digital"
  },
  {
    "tip": "🔑 Talk to yourself as you would to a close friend.",
    "category": "Cognitive"
  },
  {
    "tip": "💧 Add a slice of lemon or fruit to make water inviting.",
    "category": "Hydration"
  },
  {
    "tip": "📖 Make 10 quick flashcards for the toughest topic.",
    "category": "Study"
  },
  {
    "tip": "🪑 Use a pleasant scent or candle during study time.",
    "category": "Environment"
  },
  {
    "tip": "💧 Keep a bottle at your desk and sip every 45 minutes.",
    "category": "Hydration"
  },
  {
    "tip": "🌬️ Pause for 45 minutes to breathe with your hand on your belly.",
    "category": "Breathing"
  },
  {
    "tip": "🫁 Take 7 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "😴 Go to bed 20 minutes earlier tonight.",
    "category": "Sleep"
  },
  {
    "tip": "📖 Do a 20-minute recall session without looking at notes.",
    "category": "Study"
  },
  {
    "tip": "👥 Message a classmate to discuss today’s lecture.",
    "category": "Social"
  },
  {
    "tip": "🛌 Limit screens 10 minutes before sleep for deeper rest.",
    "category": "Sleep"
  },
  {
    "tip": "🧩 Replace “I can’t” with “I can learn this step by step.”",
    "category": "Cognitive"
  },
  {
    "tip": "🪑 Add a small plant to your study area.",
    "category": "Environment"
  },
  {
    "tip": "🎟️ Share study resources in your course forum.",
    "category": "Community"
  },
  {
    "tip": "🚶‍♂️ Do 3 bodyweight squats to boost energy.",
    "category": "Movement"
  },
  {
    "tip": "📝 Review lecture notes within 2 hours to lock in memory.",
    "category": "Study"
  },
  {
    "tip": "🌬️ Take 5 slow belly breaths to reset your nervous system.",
    "category": "Breathing"
  },
  {
    "tip": "🚶‍♂️ Take a brisk 10-minute walk between study blocks.",
    "category": "Movement"
  },
  {
    "tip": "🧸 Take a 25-minute power nap if you’re exhausted.",
    "category": "Rest"
  }
]

function makeClient() {
  const opts = ENDPOINT ? { region: REGION, endpoint: ENDPOINT } : { region: REGION };
  const ddb = new DynamoDBClient(opts);
  const doc = DynamoDBDocumentClient.from(ddb);
  return { ddb, doc };
}

async function describeTable(ddb) {
  const cmd = new DescribeTableCommand({ TableName: TABLE });
  const res = await ddb.send(cmd);
  return res.Table;
}

function gatherIndexKeyRequirements(table) {
  // returns { attrName: 'S'|'N' } for any attribute used as GSI key
  const required = {};
  const gsis = table.GlobalSecondaryIndexes || [];
  const attrDefs = (table.AttributeDefinitions || []).reduce((m, a) => {
    m[a.AttributeName] = a.AttributeType; // 'S'|'N'|'B'
    return m;
  }, {});

  for (const g of gsis) {
    const ks = g.KeySchema || [];
    for (const k of ks) {
      const name = k.AttributeName;
      required[name] = attrDefs[name] || 'S';
    }
  }
  return required;
}

function coerceAttrValueForType(val, type) {
  if (type === 'N') {
    const n = Number(val);
    if (Number.isNaN(n)) return 0;
    return n;
  }
  // For strings: avoid empty/null because GSIs require a scalar value
  if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
    return 'General';
  }
  return String(val);
}

async function batchWriteWithRetry(doc, requestItems) {
  let unprocessed = requestItems;
  let attempt = 0;
  while (unprocessed && Object.keys(unprocessed).length && attempt < 8) {
    attempt++;
    try {
      const resp = await doc.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      unprocessed = resp.UnprocessedItems && Object.keys(resp.UnprocessedItems).length ? resp.UnprocessedItems : null;
      if (unprocessed) {
        console.warn(`BatchWrite returned UnprocessedItems, retry ${attempt}...`);
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    } catch (err) {
      // surface GSI type mismatch errors clearly
      if (err && String(err.message || '').includes('Type mismatch for Index Key')) {
        console.error('Validation error writing items:', err && err.message);
        throw err;
      }
      console.error('BatchWrite failed:', err && (err.message || err));
      throw err;
    }
  }
  if (unprocessed) {
    throw new Error('Some items remained unprocessed after retries');
  }
}

(async function main() {
  try {
    console.log('Seeder starting. Table:', TABLE, 'region:', REGION, ENDPOINT ? 'endpoint=' + ENDPOINT : '');
    const { ddb, doc } = makeClient();

    const table = await describeTable(ddb);
    console.log('Table KeySchema:', JSON.stringify(table.KeySchema || [], null, 2));
    if (table.GlobalSecondaryIndexes) {
      console.log('GlobalSecondaryIndexes:', table.GlobalSecondaryIndexes.map(g => g.IndexName).join(', '));
    } else {
      console.log('No GSIs detected on table.');
    }

    const requiredIndexAttrs = gatherIndexKeyRequirements(table);
    console.log('Index-required attributes:', requiredIndexAttrs);

    // prepare items ensuring we include required index attributes with proper types
    const items = BASE_TIPS.map((t, i) => {
      const base = {
        id: `t${i + 1}`, // partition key assumed to be 'id' (string) — change if your table uses a different PK name
        tip: t.tip || t.title || '',
        category: t.category || 'General',
        createdAt: new Date().toISOString()
      };

      // ensure every required index attr exists and has correct type
      for (const [attr, type] of Object.entries(requiredIndexAttrs)) {
        if (base[attr] === undefined || base[attr] === null) {
          base[attr] = type === 'N' ? 0 : 'General';
        } else {
          base[attr] = coerceAttrValueForType(base[attr], type);
        }
      }
      return base;
    });

    // chunk into batch size 25
    const chunks = [];
    for (let i = 0; i < items.length; i += 25) chunks.push(items.slice(i, i + 25));

    for (const chunk of chunks) {
      const requestItems = {};
      requestItems[TABLE] = chunk.map(item => ({ PutRequest: { Item: item } }));
      await batchWriteWithRetry(doc, requestItems);
      console.log('Wrote chunk:', chunk.map(it => it.id));
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seeder error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
})();