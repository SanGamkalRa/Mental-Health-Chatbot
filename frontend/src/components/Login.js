// src/pages/Login.js
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./css/Login.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

export default function Login() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const didInitRef = useRef(false); // prevents double-run (StrictMode / duplicate effects)

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const token = localStorage.getItem("token");
    console.log("[Login] useEffect token:", token);
    if (token) {
      navigate("/dashboard", { replace: true });
      return;
    }

    const reg = localStorage.getItem("userRegistered");
    if (reg === "true") {
      setRegistered(true);
      const savedName = localStorage.getItem("userName");
      if (savedName) setUsername(savedName);
      const savedEmail = localStorage.getItem("userEmail");
      if (savedEmail) setEmail(savedEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // API helper
  const api = async (path, opts = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    console.log("[Login] handleLogin start — registered:", registered);

    if (!registered) {
      if (!username || !email) {
        alert("Please enter a username and email (required the first time).");
        return;
      }
      setSubmitting(true);
      try {
        const payload = { name: username, email };
        const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });

        // persist authoritative auth state before navigating
        if (data.token) localStorage.setItem("token", data.token);
        localStorage.setItem("userRegistered", "true");
        localStorage.setItem("userName", data.user?.name || username);
        if (data.user?.email) localStorage.setItem("userEmail", data.user.email);

        navigate("/dashboard", { replace: true });
      } catch (err) {
        console.error("Register error", err);
        alert(err?.message || "Could not register. Try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // returning user
    if (!username) {
      alert("Please enter your username.");
      return;
    }

    setSubmitting(true);
    try {
      const storedEmail = localStorage.getItem("userEmail");
      const payload = storedEmail ? { email: storedEmail } : { name: username };

      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });

      if (data.token) localStorage.setItem("token", data.token);
      localStorage.setItem("userName", data.user?.name || username);
      if (data.user?.email) localStorage.setItem("userEmail", data.user.email);
      localStorage.setItem("userRegistered", "true");

      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Login error", err);
      alert(err?.message || "Login failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-left">
        <div className="overlay">
          <h1>Welcome Back!</h1>
          <p>Your mental wellness companion is here for you 💙</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2>Mental Health Chatbot</h2>

          <form onSubmit={handleLogin} className="login-form">
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />

            {!registered && (
              <input
                type="email"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}

            <button type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : registered ? "Login" : "Register & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
