import React from "react";
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

export default function Dashboard() {
  const navigate = useNavigate();

  // get stored username
  const username = localStorage.getItem("userName") || "User";

  // Example mood tracking data
  const data = [
    { date: "Apr 12", mood: 1 },
    { date: "Apr 13", mood: 2 },
    { date: "Apr 14", mood: 3 },
    { date: "Apr 15", mood: 2 },
    { date: "Apr 16", mood: 3 },
  ];

  return (
    <div>
      {/* Header */}
      <header className="dashboard-header">
        <h1>Welcome back, {username} 👋</h1>
        <p>Here’s your wellness overview for today</p>
      </header>

      {/* Cards Section */}
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

      {/* Mood Tracking + Tips Section */}
      <section className="dashboard-grid">
        {/* Mood Tracking Preview */}
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

        {/* Wellness Tips */}
        <div className="wellness-tips">
          <h2>Wellness Tips 🌱</h2>
          <ul>
            <li>💤 Take short breaks during study sessions</li>
            <li>🚶 Go for a 10-min walk to refresh your mind</li>
            <li>📖 Try journaling your thoughts daily</li>
            <li>☕ Stay hydrated & limit caffeine intake</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
