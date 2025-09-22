import React, { useEffect, useMemo, useState } from "react";
import "./css/MoodTracker.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
} from "recharts";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

const MOODS = [
  { value: 1, emoji: "😞", label: "Terrible" },
  { value: 2, emoji: "😕", label: "Bad" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "😊", label: "Good" },
  { value: 5, emoji: "😁", label: "Great" },
];

// Map common backend strings to numeric mood values.
// Extend this map if your backend uses other words.
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

function toYYYYMMDD(date) {
  return date.toISOString().slice(0, 10);
}
function firstDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function lastDayOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function daysInMonth(date) {
  return lastDayOfMonth(date).getDate();
}

// Normalize a date-like string into YYYY-MM-DD.
function normalizeDateStr(d) {
  if (!d) return null;
  if (d instanceof Date) return toYYYYMMDD(d);
  const s = String(d);
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s.slice(0, 10))) {
    return s.slice(0, 10);
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return toYYYYMMDD(parsed);
  return null;
}

// Convert mood to numeric value when possible, else return null.
// Accepts numeric, numeric-string, or textual mood (like "sad").
function moodToNumber(m) {
  if (m == null) return null;
  if (typeof m === "number" && Number.isFinite(m)) return m;
  const s = String(m).trim();
  if (s === "") return null;
  // numeric string?
  const num = Number(s);
  if (Number.isFinite(num)) return num;
  // textual mapping (case-insensitive)
  const mapped = MOOD_MAP[s.toLowerCase()];
  return Number.isFinite(mapped) ? mapped : null;
}

// Keep original mood text for display when numeric mapping is not available.
function moodToLabel(m) {
  if (m == null) return null;
  if (typeof m === "number" && Number.isFinite(m)) {
    const found = MOODS.find((x) => x.value === m);
    return found ? found.label : String(m);
  }
  const s = String(m).trim();
  if (s === "") return null;
  return s;
}

function normalizeEntry(entry) {
  if (!entry) return null;
  const nd = normalizeDateStr(
    entry.date || entry.dateISO || entry.createdAt || ""
  );
  const numeric = moodToNumber(entry.mood);
  const label = moodToLabel(numeric != null ? numeric : entry.mood);
  return {
    ...entry,
    date: nd,
    mood: numeric, // numeric for chart & averaging (null if unknown)
    moodRaw: entry.mood, // keep original string if needed
    moodLabel: label, // text to show in list if numeric not present
    note: typeof entry.note === "string" ? entry.note : entry.notes || "",
  };
}

function normalizeEntries(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeEntry).filter((e) => e && e.date);
}

export default function MoodTracker({ apiBase = API_BASE }) {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("userName") || null;
  console.log(username);
  const [monthToShow, setMonthToShow] = useState(firstDayOfMonth(new Date()));
  const [entries, setEntries] = useState([]); // normalized entries
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
        if (username) headers["x-username"] = username;
        console.log(qs, headers);
        const res = await fetch(`${apiBase}/api/mood?${qs}`, { headers });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || "Failed to load moods");
        }
        const json = await res.json();
        console.log(json);
        const raw = Array.isArray(json) ? json : json.moods || json;
        if (mounted) setEntries(normalizeEntries(raw));
      } catch (err) {
        console.error("fetch month error", err);
        if (mounted) setError(err.message || "Failed to load moods");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchMonth();
    return () => {
      mounted = false;
    };
  }, [apiBase, token, username, year, month]);

  const byDate = useMemo(() => {
    const m = new Map();
    entries.forEach((e) => {
      if (e && e.date) m.set(e.date, e);
    });
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
        // mood is numeric for chart (null if unknown)
        mood: e ? (typeof e.mood === "number" ? e.mood : null) : null,
        // for display in list prefer emoji (if numeric) else textual label
        moodDisplay: e
          ? e.mood
            ? MOODS.find((m) => m.value === e.mood)?.emoji || e.moodLabel
            : e.moodLabel
          : null,
        note: e ? e.note || "" : "",
        weekday: dt.toLocaleString(undefined, { weekday: "short" }),
      });
    }
    return out;
  }, [monthToShow, byDate, year]);

  // chart data (null for no numeric mood -> line breaks)
  const chartData = useMemo(() => {
    return monthData.map((d) => ({
      dateLabel: `${d.label}`,
      mood: d.mood === null ? null : d.mood,
      iso: d.dateISO,
      weekday: d.weekday,
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
    if (todayEntry)
      return alert("✅ You've already logged your mood for today.");

    setSaving(true);
    setError(null);

    // allow selectedMood to be either {value:number} or {value:label-string}
    const payloadMood = selectedMood.value;
    const payload = {
      date: today,
      mood: payloadMood, // keep original form (server may expect string or number)
      note: note.trim() || null,
      username: username || null,
    };

    // optimistic update: create normalized record
    const optimisticRaw = {
      date: today,
      mood: payloadMood,
      note: payload.note,
      username: payload.username,
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => {
      const without = prev.filter((p) => p.date !== today);
      const optimistic = normalizeEntry(optimisticRaw);
      return [optimistic, ...without];
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
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to save mood");
      }
      const saved = await res.json().catch(() => null);
      if (saved && saved.record) {
        const rec = normalizeEntry(saved.record);
        setEntries((prev) => {
          const without = prev.filter((e) => e.date !== rec.date);
          return [rec, ...without];
        });
      }
      setSelectedMood(null);
      setNote("");
    } catch (err) {
      console.error("save mood error", err);
      setError(err.message || "Failed to save mood");
      // rollback by refetching month
      try {
        const qs = `year=${year}&month=${String(month).padStart(2, "0")}`;
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        else if (username) headers["x-username"] = username;
        const refetch = await fetch(`${apiBase}/api/mood?${qs}`, { headers });
        if (refetch.ok) {
          const json = await refetch.json();
          const raw = Array.isArray(json) ? json : json.moods || json;
          setEntries(normalizeEntries(raw));
        }
      } catch (e) {
        /* ignore */
      }
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

  return (
    <div className="mood-container">
      <div className="mood-tracker-card">
        <div className="mt-header">
          <div className="mt-title">
            <h2>Mood Tracker</h2>
          </div>

          <div className="mt-controls">
            <button
              className="nav-btn"
              onClick={prevMonth}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="month-pill" aria-live="polite">
              {monthToShow.toLocaleString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </div>
            <button
              className="nav-btn"
              onClick={nextMonth}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-first-chart">
          <div className="mt-chart">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 8, left: 8, bottom: 6 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.06}
                />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={{ stroke: "#e6e9ee" }}
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  interval={Math.max(0, Math.floor(chartData.length / 10))}
                />
                <YAxis
                  domain={[0, 6]}
                  ticks={[1, 2, 3, 4, 5]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                />
                <Tooltip
                  formatter={(value) =>
                    value == null ? "No numeric entry" : `${value}`
                  }
                  labelFormatter={(label, payload) => {
                    const item =
                      (payload && payload[0] && payload[0].payload) || {};
                    return `Day ${label} — ${item.weekday || ""}`;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="mood"
                  stroke="none"
                  fill="rgba(121, 13, 229, 0.08)"
                  connectNulls={false}
                  isAnimationActive={true}
                />
    <Line
  type="monotone"
  dataKey="mood"
  stroke="#764ba2"
  strokeWidth={3}
  dot={{ r: 5, stroke: "#764ba2", strokeWidth: 2, fill: "#fff" }}
  activeDot={{ r: 7, stroke: "#764ba2", strokeWidth: 2, fill: "#fff" }}
  connectNulls={false}
/>


              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-body">
          <div className="mt-left">
            <div className="mt-prompt">
              <p>
                How are you feeling today?{" "}
                <span className="mt-today">({today})</span>
              </p>
              <div
                className="mt-options"
                role="radiogroup"
                aria-label="Choose your mood"
              >
                {MOODS.map((m) => {
                  const disabled = !!todayEntry || saving;
                  const isSelected =
                    selectedMood && selectedMood.value === m.value;
                  return (
                    <button
                      key={m.value}
                      className={`mt-option ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedMood(m)}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      title={m.label}
                    >
                      <div className="mt-emoji" aria-hidden>
                        {m.emoji}
                      </div>
                      <div className="mt-label">{m.label}</div>
                    </button>
                  );
                })}
                {/* Optionally allow mapping textual moods (e.g. "sad") as a quick-select:
                    <button onClick={() => setSelectedMood({ value: 'sad' })}>Sad</button>
                */}
              </div>

              <textarea
                className="mt-note"
                placeholder="Optional note (why you feel this way)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                disabled={!!todayEntry || saving}
              />

              <div className="mt-actions">
                <button
                  className="btn-primary"
                  onClick={saveTodayMood}
                  disabled={!!todayEntry || saving}
                >
                  {todayEntry
                    ? "Already logged"
                    : saving
                    ? "Saving..."
                    : "Save today's mood"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setSelectedMood(null);
                    setNote("");
                  }}
                  disabled={saving}
                >
                  Clear
                </button>
              </div>

              {error && <div className="mt-error">{error}</div>}
              {todayEntry && (
                <div className="mt-note-saved">
                  ✅ You logged:&nbsp;
                  {todayEntry.mood
                    ? MOODS.find((m) => m.value === todayEntry.mood)?.emoji ||
                      todayEntry.moodLabel
                    : todayEntry.moodLabel}
                  {todayEntry.note ? ` — ${todayEntry.note}` : ""}
                </div>
              )}
            </div>
          </div>

          <div className="mt-right">
            <div className="mt-list">
              <h4>Month entries</h4>
              {loading ? (
                <div className="mt-loading">Loading...</div>
              ) : (
                <ul>
                  {monthData.map((d) => (
                    <li key={d.dateISO} className="mt-row" title={d.note || ""}>
                      <div className="mt-row-date">
                        {new Date(d.dateISO).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      <div className="mt-row-mood">
                        {d.moodDisplay ? (
                          d.moodDisplay
                        ) : (
                          <span className="mt-empty">—</span>
                        )}
                      </div>
                      <div className="mt-row-note">
                        {d.note ? (
                          d.note
                        ) : (
                          <span className="mt-note-muted">No note</span>
                        )}
                      </div>
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
