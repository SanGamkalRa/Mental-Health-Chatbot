import React, { useEffect, useState } from "react";
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

export default function Dashboard() {
  const navigate = useNavigate();
  const username = localStorage.getItem("userName") || "User";
  const token = localStorage.getItem("token");

  const [dailyTips, setDailyTips] = useState([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState(null);

  

// inside Dashboard component file (replace the useEffect part)

function getTodayUTCDateString() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

useEffect(() => {
  let mounted = true;
  async function fetchTips(dateStr = getTodayUTCDateString()) {
    setTipsLoading(true);
    setTipsError(null);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/wellness/daily?date=${encodeURIComponent(dateStr)}&n=5`, {
        headers: { 'Content-Type': 'application/json', ...headers }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to fetch tips');
      }
      const json = await res.json();
      if (mounted) setDailyTips(json.tips || []);
    } catch (err) {
      console.error('fetch tips error', err);
      if (mounted) setTipsError(err.message || 'Error fetching tips');
    } finally {
      if (mounted) setTipsLoading(false);
    }
  }

  // initial fetch uses today's UTC date
  fetchTips();

  // expose a simple refetch utility (optional). You can call refetchTips() from other hooks or events.
  window.refetchWellnessTips = (dateStr) => fetchTips(dateStr);

  return () => { mounted = false; };
}, [token]); // unchanged


  // Example mood tracking data (keep as you had)
  const data = [
    { date: "Apr 12", mood: 1 },
    { date: "Apr 13", mood: 2 },
    { date: "Apr 14", mood: 3 },
    { date: "Apr 15", mood: 2 },
    { date: "Apr 16", mood: 3 },
  ];

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
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data}>
              <XAxis dataKey="date" />
              <YAxis domain={[0, 3]} ticks={[1, 2, 3]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="mood"
                stroke="#764ba2"
                strokeWidth={3}
                dot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
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
