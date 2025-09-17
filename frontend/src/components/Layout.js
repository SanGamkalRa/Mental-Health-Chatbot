// src/components/Layout.js
import React, { useEffect, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./css/Layout.css";

export default function Layout() {
  const navigate = useNavigate();
  const initRef = useRef(false);

  useEffect(() => {
    // run only once (protects against StrictMode double-run in dev)
    if (initRef.current) return;
    initRef.current = true;

    // Prefer checking the token (what Login actually sets) instead of a custom flag
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    // clear all auth-related keys you use
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRegistered");
    // optional: if you were using isLoggedIn anywhere, remove it too
    localStorage.removeItem("isLoggedIn");
    navigate("/", { replace: true });
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>MindCare</h2>
        <nav>
          <ul>
            <li>
              <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
                🏠 Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/chatbot" className={({ isActive }) => (isActive ? "active" : "")}>
                💬 Chatbot
              </NavLink>
            </li>
            <li>
              <NavLink to="/mood-tracker" className={({ isActive }) => (isActive ? "active" : "")}>
                📊 Mood Tracker
              </NavLink>
            </li>
            <li>
              <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
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
