// backend/src/services/intentMatcher.js
const fs = require('fs');
const path = require('path');

const intentsPath = path.join(__dirname, '..', 'resources', 'intents_large.json');

let intentsData = { intents: [] };
try {
  const raw = fs.readFileSync(intentsPath, 'utf8');
  const parsed = JSON.parse(raw);
  // allow both { intents: [...] } or plain array
  intentsData.intents = Array.isArray(parsed.intents) ? parsed.intents : (Array.isArray(parsed) ? parsed : parsed.intents || []);
} catch (err) {
  console.error('Failed to load intents JSON at', intentsPath, err.message || err);
  intentsData = { intents: [] };
}

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s) => (s ? normalize(s).split(" ").filter(Boolean) : []);

const tokenOverlap = (aTokens, bTokens) => {
  if (!aTokens.length || !bTokens.length) return 0;
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter += 1; });
  const unionSize = new Set([...setA, ...setB]).size || 1;
  return inter / unionSize;
};

function getBestIntent(userText) {
  const text = normalize(userText);
  const userTokens = tokens(text);

  if (!text) {
    const noResp = intentsData.intents.find((i) => i.tag === "no-response" || i.tag === "fallback");
    return { tag: noResp ? noResp.tag : "no-response", score: 1, intent: noResp || null };
  }

  let best = { score: 0, intent: null, patternMatched: null, tag: null };

  for (const intent of intentsData.intents) {
    if (!intent || !intent.patterns) continue;
    for (const pattern of intent.patterns) {
      const patNorm = normalize(pattern || "");
      const patTokens = tokens(patNorm);

      // exact match
      if (patNorm && patNorm === text) {
        return { score: 1.0, intent, patternMatched: pattern, tag: intent.tag };
      }

      // substring match
      if (patNorm && (text.includes(patNorm) || patNorm.includes(text))) {
        const s = 0.92;
        if (s > best.score) best = { score: s, intent, patternMatched: pattern, tag: intent.tag };
        continue;
      }

      // token-overlap
      const overlap = tokenOverlap(userTokens, patTokens);
      const weight = patTokens.length < 3 ? 0.95 : 1.0;
      const score = overlap * weight;
      if (score > best.score) best = { score, intent, patternMatched: pattern, tag: intent.tag };
    }
    if (best.score === 1.0) break;
  }

  return { tag: best.intent ? best.intent.tag : null, score: best.score, intent: best.intent };
}

function getResponse(userText, options = {}) {
  const { fallbackThreshold = 0.25 } = options;
  const match = getBestIntent(userText);

  if (!match.intent || match.score < fallbackThreshold) {
    const fallback =
      intentsData.intents.find((i) => i.tag === "no-response") ||
      intentsData.intents.find((i) => i.tag === "default") ||
      null;
    const respList = (fallback && fallback.responses) || ["Sorry, I didn't understand that."];
    return { tag: fallback ? fallback.tag : "fallback", score: match.score, response: respList[Math.floor(Math.random() * respList.length)] };
  }

  const responses = match.intent.responses || ["Okay."];
  const resp = responses[Math.floor(Math.random() * responses.length)];
  return { tag: match.tag, score: match.score, response: resp };
}

module.exports = { getBestIntent, getResponse, intentsData };
