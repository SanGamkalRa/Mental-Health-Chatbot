// Layout.js
import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./css/Layout.css";

export default function Layout() {
  const navigate = useNavigate();

  useEffect(() => {
    // If user isn't logged in (session), send them back to login page.
    // This prevents manually navigating to /dashboard when not logged in.
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    if (isLoggedIn !== "true") {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>MindCare</h2>
        <nav>
          <ul>
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                🏠 Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/chatbot"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                💬 Chatbot
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/mood-tracker"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                📊 Mood Tracker
              </NavLink>
            </li>

            <li>
              <NavLink
                to="/profile"
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                👤 Profile
              </NavLink>
            </li>
          </ul>
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
