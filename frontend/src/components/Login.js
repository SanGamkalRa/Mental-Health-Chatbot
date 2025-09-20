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
  const didInitRef = useRef(false);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    const token = localStorage.getItem("token");
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
    if (!res.ok) {
      const err = new Error(data?.message || "Request failed");
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  };

  const isEmail = (s) => /\S+@\S+\.\S+/.test(String(s || ""));

  // normalize name to the same form the server expects for username checks
  const normalizeName = (s) => {
    if (!s) return "";
    return String(s)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
  };

  // ask backend whether the normalized name is ambiguous (used by handleLogin)
  const isNameAmbiguous = async (rawName) => {
    if (!rawName) return false;
    const normalized = normalizeName(rawName);
    try {
      const resp = await api(`/api/users/check-name?name=${encodeURIComponent(normalized)}`);
      return (resp.count || 0) > 1;
    } catch (e) {
      // if the check fails, be conservative and treat as ambiguous to avoid accidental login
      console.warn("Name-check failed, treating as ambiguous:", e);
      return true;
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username && !email) {
      alert("Please enter a username or email.");
      return;
    }

    setSubmitting(true);

    try {
      // 1) If explicit email provided -> login by email
      if (email && isEmail(email)) {
        const loginData = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        });

        if (!loginData?.token || !loginData?.user) throw new Error("Login failed: invalid response from server.");

        localStorage.setItem("token", loginData.token);
        localStorage.setItem("userName", loginData.user.name);
        localStorage.setItem("userEmail", loginData.user.email || "");
        localStorage.setItem("userRegistered", "true");
        navigate("/dashboard", { replace: true });
        return;
      }

      // 2) No email typed -> try to login by username
      const typedName = username.trim();
      const storedEmail = localStorage.getItem("userEmail");
      const storedName = localStorage.getItem("userName");

      if (!typedName) {
        // fallback to stored email if present
        if (storedEmail) {
          const loginData = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: storedEmail }),
          });
          if (loginData?.token) {
            localStorage.setItem("token", loginData.token);
            localStorage.setItem("userName", loginData.user?.name || storedEmail.split("@")[0]);
            localStorage.setItem("userEmail", loginData.user?.email || storedEmail);
            localStorage.setItem("userRegistered", "true");
            navigate("/dashboard", { replace: true });
            return;
          }
        }
        alert("Please enter a username or email.");
        setSubmitting(false);
        return;
      }

      // If typedName matches stored name and we have storedEmail, prefer email login for safety
      if (storedName && storedEmail && storedName === typedName) {
        const loginData = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: storedEmail }),
        });
        if (loginData?.token) {
          localStorage.setItem("token", loginData.token);
          localStorage.setItem("userName", loginData.user?.name || typedName);
          localStorage.setItem("userEmail", loginData.user?.email || storedEmail);
          localStorage.setItem("userRegistered", "true");
          navigate("/dashboard", { replace: true });
          return;
        }
      }

      // Check ambiguity before attempting name-login
      const ambiguous = await isNameAmbiguous(typedName);
      if (ambiguous) {
        alert(
          "Multiple accounts share that username. Please enter the email associated with your account so we can sign you in."
        );
        setSubmitting(false);
        return;
      }

      // Safe to attempt login by normalized name
      const loginPayload = { name: normalizeName(typedName) };
      const loginData = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(loginPayload),
      });

      if (!loginData?.token || !loginData?.user) throw new Error("Login failed: invalid response from server.");

      localStorage.setItem("token", loginData.token);
      localStorage.setItem("userName", loginData.user.name || typedName);
      if (loginData.user?.email) localStorage.setItem("userEmail", loginData.user.email);
      localStorage.setItem("userRegistered", "true");
      navigate("/dashboard", { replace: true });
      return;
    } catch (err) {
      // If user not found -> attempt register (existing flow), email required
      if (err.status === 404) {
        let regEmail = email || localStorage.getItem("userEmail");

        if (!regEmail || !isEmail(regEmail)) {
          regEmail = window.prompt("No account found. Enter your email to register:");
          if (!regEmail || !isEmail(regEmail)) {
            alert("Valid email is required to register.");
            setSubmitting(false);
            return;
          }
        }

        try {
          const payload = { name: username.trim() || regEmail.split("@")[0], email: regEmail.trim().toLowerCase() };
          const regData = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          if (regData.token) localStorage.setItem("token", regData.token);
          localStorage.setItem("userRegistered", "true");
          localStorage.setItem("userName", regData.user?.name || payload.name);
          if (regData.user?.email) localStorage.setItem("userEmail", regData.user.email);

          navigate("/dashboard", { replace: true });
          return;
        } catch (regErr) {
          if (regErr.status === 409) {
            alert(regErr.payload?.message || "Username or email already in use. Try a different username or email.");
          } else {
            console.error("Register error", regErr);
            alert(regErr.payload?.message || "Could not register. Try again.");
          }
          setSubmitting(false);
          return;
        }
      }

      // other errors
      if (err.status === 409) {
        alert(err.payload?.message || "Conflict. Try different credentials.");
      } else {
        console.error("Login error", err);
        alert(err.payload?.message || err.message || "Login failed. Try again.");
      }
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
            />

            <input
              type="email"
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button type="submit" disabled={submitting}>
              {submitting ? "Please wait..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
