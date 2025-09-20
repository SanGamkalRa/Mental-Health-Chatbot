import React, { useEffect, useMemo, useState } from "react";
import "./css/MoodTracker.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

const MOODS = [
  { value: 1, emoji: "😞", label: "Terrible" },
  { value: 2, emoji: "😕", label: "Bad" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "😊", label: "Good" },
  { value: 5, emoji: "😁", label: "Great" },
];

function toYYYYMMDD(date) {
  return date.toISOString().slice(0, 10);
}
function firstDayOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function lastDayOfMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function daysInMonth(date) { return lastDayOfMonth(date).getDate(); }

export default function MoodTracker({ apiBase = API_BASE }) {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("userName") || null;

  const [monthToShow, setMonthToShow] = useState(firstDayOfMonth(new Date()));
  const [entries, setEntries] = useState([]); // backend rows: {date:"YYYY-MM-DD", mood:1..5, note}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedMood, setSelectedMood] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const year = monthToShow.getFullYear();
  const month = monthToShow.getMonth() + 1;

  useEffect(() => {
    let mounted = true;
    async function fetchMonth() {
      setLoading(true);
      setError(null);
      try {
        const qs = `year=${year}&month=${String(month).padStart(2, "0")}`;
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        else if (username) headers["x-username"] = username;

        const res = await fetch(`${apiBase}/api/mood?${qs}`, { headers });
        if (!res.ok) {
          const body = await res.json().catch(()=>({}));
          throw new Error(body.message || "Failed to load moods");
        }
        const json = await res.json();
        if (mounted) setEntries(Array.isArray(json) ? json : (json.moods || []));
      } catch (err) {
        console.error("fetch month error", err);
        if (mounted) setError(err.message || "Failed to load moods");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchMonth();
    return () => { mounted = false; };
  }, [apiBase, token, username, year, month]);

  const byDate = useMemo(() => {
    const m = new Map();
    entries.forEach(e => { if (e && e.date) m.set(e.date, e); });
    return m;
  }, [entries]);

  const monthData = useMemo(() => {
    const dCount = daysInMonth(monthToShow);
    const out = [];
    for (let d = 1; d <= dCount; d++) {
      const dt = new Date(year, monthToShow.getMonth(), d);
      const key = toYYYYMMDD(dt);
      const e = byDate.get(key) || null;
      out.push({
        dateISO: key,
        label: String(d).padStart(2, "0"),
        mood: e ? e.mood : null,
        note: e ? e.note : "",
      });
    }
    return out;
  }, [monthToShow, byDate, year]);

  // chart data for LineChart (use null for missing days so line breaks)
  const chartData = useMemo(() => {
    return monthData.map(d => ({
      dateLabel: d.label,
      mood: d.mood === null ? null : d.mood,
      iso: d.dateISO,
    }));
  }, [monthData]);

  const today = useMemo(() => {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, "0");
    const d = String(n.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const todayEntry = byDate.get(today);

  async function saveTodayMood() {
    if (saving) return;
    if (!selectedMood) return alert("Please choose a mood.");
    if (todayEntry) return alert("✅ You've already logged your mood for today.");

    setSaving(true);
    setError(null);
    const payload = {
      date: today,
      mood: selectedMood.value,
      note: note.trim() || null,
      username: username || null,
    };

    // optimistic update
    setEntries(prev => {
      const without = prev.filter(p => p.date !== today);
      return [{ date: today, mood: payload.mood, note: payload.note, username: payload.username }, ...without];
    });

    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      else if (username) headers["x-username"] = username;

      const res = await fetch(`${apiBase}/api/mood`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(()=>({}));
        throw new Error(body.message || "Failed to save mood");
      }
      const saved = await res.json().catch(()=>null);
      if (saved && saved.record) {
        setEntries(prev => {
          const without = prev.filter(e => e.date !== saved.record.date);
          return [saved.record, ...without];
        });
      }
      setSelectedMood(null);
      setNote("");
    } catch (err) {
      console.error("save mood error", err);
      setError(err.message || "Failed to save mood");
      // rollback by refetching
      try {
        const qs = `year=${year}&month=${String(month).padStart(2, "0")}`;
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        else if (username) headers["x-username"] = username;
        const refetch = await fetch(`${apiBase}/api/mood?${qs}`, { headers });
        if (refetch.ok) {
          const json = await refetch.json();
          setEntries(Array.isArray(json) ? json : (json.moods || []));
        }
      } catch (e) { /* ignore */ }
    } finally {
      setSaving(false);
    }
  }

  function prevMonth() {
    const cur = monthToShow;
    setMonthToShow(new Date(cur.getFullYear(), cur.getMonth() - 1, 1));
  }
  function nextMonth() {
    const cur = monthToShow;
    setMonthToShow(new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
  }

  const avg = (() => {
    const vals = monthData.map(d => d.mood).filter(v => v != null);
    if (vals.length === 0) return "-";
    return (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2);
  })();

  return (
    <div className="mood-container">
      <div className="mood-tracker-card">
        <div className="mt-header">
          <h2>Mood Tracker</h2>
          <div className="mt-controls">
            <button className="mt-nav" onClick={prevMonth} aria-label="Previous month">◀</button>
            <div className="mt-month-label">
              {monthToShow.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>
            <button className="mt-nav" onClick={nextMonth} aria-label="Next month">▶</button>
          </div>
        </div>

        <div className="mt-subheader">Monthly average: <strong>{avg}</strong></div>

        {/* FIRST SECTION: full-width LineChart (same style as dashboard) */}
        <div className="mt-first-chart">
          <div className="mt-chart">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <XAxis dataKey="dateLabel" />
                <YAxis domain={[0, 6]} ticks={[1,2,3,4,5]} />
                <Tooltip formatter={(value) => (value == null ? "No entry" : `${value}`)} />
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
          </div>
        </div>

        {/* SECOND SECTION: tracker on left, month list on right */}
        <div className="mt-body">
          <div className="mt-left">
            <div className="mt-prompt">
              <p>How are you feeling today? <span className="mt-today">({today})</span></p>
              <div className="mt-options">
                {MOODS.map(m => {
                  const disabled = !!todayEntry || saving;
                  const isSelected = selectedMood && selectedMood.value === m.value;
                  return (
                    <button
                      key={m.value}
                      className={`mt-option ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedMood(m)}
                      disabled={disabled}
                      title={m.label}
                    >
                      <div className="mt-emoji">{m.emoji}</div>
                      <div className="mt-label">{m.label}</div>
                    </button>
                  );
                })}
              </div>

              <textarea
                className="mt-note"
                placeholder="Optional note (why you feel this way)"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                disabled={!!todayEntry || saving}
              />

              <div className="mt-actions">
                <button className="btn-primary" onClick={saveTodayMood} disabled={!!todayEntry || saving}>
                  {todayEntry ? "Already logged" : (saving ? "Saving..." : "Save today's mood")}
                </button>
                <button className="btn-ghost" onClick={() => { setSelectedMood(null); setNote(""); }} disabled={saving}>
                  Clear
                </button>
              </div>

              {error && <div className="mt-error">{error}</div>}
              {todayEntry && (
                <div className="mt-note-saved">
                  ✅ You logged: {MOODS.find(m=>m.value===todayEntry.mood)?.emoji || todayEntry.mood}
                  {todayEntry.note ? ` — ${todayEntry.note}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="mt-right">
            <div className="mt-list">
              <h4>Month entries</h4>
              {loading ? (
                <div>Loading...</div>
              ) : (
                <ul>
                  {monthData.map(d => (
                    <li key={d.dateISO} className="mt-row">
                      <div className="mt-row-date">{new Date(d.dateISO).toLocaleDateString()}</div>
                      <div className="mt-row-mood">
                        {d.mood ? (MOODS.find(m=>m.value===d.mood)?.emoji || d.mood) : <span className="mt-empty">—</span>}
                      </div>
                      <div className="mt-row-note">{d.note ? d.note : ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
