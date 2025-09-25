import React, { useEffect, useState, useMemo } from "react";
import "./css/Dashboard.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

// small textual->numeric map (keeps parity with your MoodTracker)
const MOOD_MAP = {
  terrible: 1,
  sad: 2,
  bad: 2,
  okay: 3,
  ok: 3,
  neutral: 3,
  good: 4,
  happy: 4,
  great: 5,
  excellent: 5,
};

function toYYYYMMDD(d) {
  return d.toISOString().slice(0, 10);
}

// convert backend mood (number or text) to numeric value or null
function moodToNumber(m) {
  if (m == null) return null;
  if (typeof m === "number" && Number.isFinite(m)) return m;
  const s = String(m).trim();
  if (s === "") return null;
  const num = Number(s);
  if (Number.isFinite(num)) return num;
  const mapped = MOOD_MAP[s.toLowerCase()];
  return Number.isFinite(mapped) ? mapped : null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const username = localStorage.getItem("userName") || "User";
  const token = localStorage.getItem("token");
  console.log("token:", token);

  const [dailyTips, setDailyTips] = useState([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState(null);

  // ---- new: mood chart state ----
  const [chartData, setChartData] = useState([]); // array of { dateLabel, mood }
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);

  // fetch wellness tips (your existing logic, unchanged)
  function getTodayUTCDateString() {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

useEffect(() => {
  let mounted = true;

  async function fetchTips(dateStr = getTodayUTCDateString()) {
    setTipsLoading(true);
    setTipsError(null);

    try {
      const token = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // use API_ROOT if non-empty, otherwise rely on relative path ("/api/...")
      const base = API_ROOT ? API_ROOT : "";
      const url = `${base}/api/wellness/daily?date=${encodeURIComponent(
        dateStr
      )}&n=5`;

      const res = await fetch(url, { headers });

      // Helpful diagnostics — log status & body when not OK
      if (!res.ok) {
        // try to parse json body for server message
        let bodyText;
        try {
          bodyText = await res.json();
        } catch (e) {
          bodyText = await res.text().catch(() => "(no body)");
        }
        const msg =
          bodyText && bodyText.message
            ? bodyText.message
            : JSON.stringify(bodyText);
        console.warn("fetchTips failed:", res.status, msg, url);
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!mounted) return;

      // handle flexible payloads: { tips: [...] } or array
      const tipsArray = Array.isArray(json) ? json : json.tips || [];
      setDailyTips(tipsArray);
    } catch (err) {
      console.error("fetch tips error", err);
      if (mounted) {
        // display friendly error but keep console logs for debugging
        setTipsError(
          err.message?.toString() ||
            "Unable to fetch wellness tips. Check console for details."
        );
      }
    } finally {
      if (mounted) setTipsLoading(false);
    }
  }

  // initial fetch
  fetchTips();
  // expose for dev debugging
  window.refetchWellnessTips = (dateStr) => fetchTips(dateStr);

  return () => {
    mounted = false;
  };
}, []); // token removed from deps because we read token inside effect via getAuthToken()


  // ---- new: fetch moods for the chart ----
  useEffect(() => {
    let mounted = true;
    async function fetchMoodsForChart() {
      setChartLoading(true);
      setChartError(null);
      try {
        // We'll request the current month (server already supports year/month).
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const qs = `year=${year}&month=${month}`;
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (username) headers["x-username"] = username;

        const res = await fetch(`${API_BASE}/api/mood?${qs}`, { headers });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load moods for chart");
        }
        const json = await res.json();
        // normalize incoming payload shape flexibly
        const raw = Array.isArray(json) ? json : json.moods || json;

        // map by date string (YYYY-MM-DD) using common date fields
        const byDate = new Map();
        (Array.isArray(raw) ? raw : []).forEach((entry) => {
          if (!entry) return;
          const dateStr =
            entry.date || entry.dateISO || entry.createdAt || entry.created_at;
          const parsed = dateStr ? new Date(dateStr) : null;
          if (parsed && !isNaN(parsed.getTime())) {
            const key = toYYYYMMDD(parsed);
            // compute numeric value if possible
            const numeric = moodToNumber(entry.mood);
            byDate.set(key, { raw: entry, numeric, note: entry.note || "" });
          }
        });

        // build last 7 calendar days (including today)
        const out = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const iso = toYYYYMMDD(d);
          const label = d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
          }); // e.g. "Apr 16"
          const hit = byDate.get(iso);
          out.push({
            dateISO: iso,
            dateLabel: label,
            mood: hit ? hit.numeric : null, // null will break the line (no numeric entry)
          });
        }

        if (mounted) setChartData(out);
      } catch (err) {
        console.error("fetch chart moods error", err);
        if (mounted) setChartError(err.message || "Failed to load mood chart");
      } finally {
        if (mounted) setChartLoading(false);
      }
    }

    fetchMoodsForChart();

    // expose a simple refetch function for debugging / dev
    window.refetchDashboardMoods = fetchMoodsForChart;

    return () => {
      mounted = false;
    };
  }, [token, username]);

  // keep the rest of your dashboard UI but swap the static chart for chartData
  // (chartData: array of { dateLabel, mood })
  // Example fallback message when there is no numeric data in the last 7 days.

  return (
    <div>
      <header className="dashboard-header">
        <h1>Welcome back, {username} 👋</h1>
        <p>Here’s your wellness overview for today</p>
      </header>

      <section className="cards">
        <div className="card">
          <h3>💬 Start Chat</h3>
          <p>Talk with your AI companion now</p>
          <button onClick={() => navigate("/chatbot")}>Open Chat</button>
        </div>

        <div className="card">
          <h3>📊 Mood Tracker</h3>
          <p>See how your mood has changed over time</p>
          <button onClick={() => navigate("/mood-tracker")}>
            View Tracker
          </button>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="mood-tracking">
          <h2>Mood Tracking</h2>

          {chartLoading ? (
            <div style={{ padding: 24 }}>Loading chart…</div>
          ) : chartError ? (
            <div style={{ color: "var(--danger)", padding: 24 }}>
              {chartError}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <XAxis dataKey="dateLabel" />
                <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="mood"
                  stroke="#764ba2"
                  strokeWidth={3}
                  dot={{ r: 5 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="wellness-tips">
          <h2>Wellness Tips 🌱</h2>

          {tipsLoading && <p>Loading tips…</p>}
          {tipsError && <p className="error">{tipsError}</p>}

          {!tipsLoading && dailyTips.length > 0 && (
            <ul className="tips-list">
              {dailyTips.map((t) => (
                <li key={t.id} className="tip-item">
                  <div className="tip-content">
                    <div className="tip-text">{t.tip}</div>
                    {t.category && <div className="tip-meta">{t.category}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!tipsLoading && dailyTips.length === 0 && (
            <ul className="tips-list">
              <li className="tip-item">No tips available.</li>
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
