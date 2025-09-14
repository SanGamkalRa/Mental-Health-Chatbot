import React, { useState } from "react";
import "./css/MoodTracker.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function MoodTracker() {
  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const [moods, setMoods] = useState([
    { date: "Apr 12", mood: "😔", value: 1 },
    { date: "Apr 13", mood: "😐", value: 2 },
    { date: "Apr 14", mood: "🙂", value: 3 },
    { date: "Apr 15", mood: "😊", value: 4 },
  ]);

  const [todayMood, setTodayMood] = useState(
    moods.find((m) => m.date === today)?.mood || null
  );

  const handleMoodSelect = (mood, value) => {
    if (todayMood) {
      alert("✅ You already logged your mood today.");
      return;
    }
    const newEntry = { date: today, mood, value };
    setMoods([...moods, newEntry]);
    setTodayMood(mood);
  };

  return (
    <div className="mood-container">
      <h2>📊 Mood Tracker</h2>

      {/* Mood selection */}
      <div className="mood-select">
        <p>How are you feeling today?</p>
        <div className="mood-options">
          <span onClick={() => handleMoodSelect("😔", 1)}>😔</span>
          <span onClick={() => handleMoodSelect("😐", 2)}>😐</span>
          <span onClick={() => handleMoodSelect("🙂", 3)}>🙂</span>
          <span onClick={() => handleMoodSelect("😊", 4)}>😊</span>
        </div>
        {todayMood && (
          <p className="today">✅ You logged today’s mood as {todayMood}</p>
        )}
      </div>

      {/* Mood History + Chart */}
      <div className="mood-content">
        {/* History Table */}
        <div className="mood-table-container">
          <h3>Mood History</h3>
          <table className="mood-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mood</th>
              </tr>
            </thead>
            <tbody>
              {moods.map((m, i) => (
                <tr key={i}>
                  <td>{m.date}</td>
                  <td>{m.mood}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mood Trend Chart */}
        <div className="mood-chart">
          <h3>Mood Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={moods}>
              <XAxis dataKey="date" />
              <YAxis domain={[1, 4]} ticks={[1, 2, 3, 4]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#764ba2"
                strokeWidth={3}
                dot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
