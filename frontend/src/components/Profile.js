// src/Profile.js
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./css/Profile.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

export default function Profile() {
  const navigate = useNavigate();
  const initRef = useRef(false);

  const [name, setName] = useState(localStorage.getItem("userName") || "");
  const [email, setEmail] = useState(localStorage.getItem("userEmail") || "");
  const [registered, setRegistered] = useState(localStorage.getItem("userRegistered") === "true");
  const [editingEmail, setEditingEmail] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // run only once to avoid double runs in StrictMode
    if (initRef.current) return;
    initRef.current = true;

    // Use the token as the authoritative login flag (what Login sets)
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  // Small API helper that attaches Bearer token
  const api = async (path, opts = {}) => {
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
  };

  const initials =
    (name || "")
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  const saveName = async () => {
    if (!name.trim()) {
      alert("Name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      // call backend to update name
      const body = { name: name.trim() };
      const data = await api("/api/auth/update", { method: "PATCH", body: JSON.stringify(body) });

      // update local storage with authoritative values
      if (data.token) localStorage.setItem("token", data.token);
      if (data.user?.name) localStorage.setItem("userName", data.user.name);
      if (data.user?.email) localStorage.setItem("userEmail", data.user.email);
      if (typeof data.user?.is_registered !== "undefined")
        localStorage.setItem("userRegistered", data.user.is_registered ? "true" : "false");

      setRegistered(localStorage.getItem("userRegistered") === "true");
      alert("Name saved.");
    } catch (err) {
      console.error("Save name error:", err);
      alert(err?.message || "Could not save name. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const startEditEmail = () => setEditingEmail(true);
  const cancelEditEmail = () => {
    setEmail(localStorage.getItem("userEmail") || "");
    setEditingEmail(false);
  };

  const saveEmail = async () => {
    if (!email.trim() || !email.includes("@")) {
      alert("Please enter a valid email.");
      return;
    }
    setSaving(true);
    try {
      // call backend to update email
      const body = { email: email.trim() };
      const data = await api("/api/auth/update", { method: "PATCH", body: JSON.stringify(body) });

      // update local storage with authoritative values
      if (data.token) localStorage.setItem("token", data.token);
      if (data.user?.name) localStorage.setItem("userName", data.user.name);
      if (data.user?.email) localStorage.setItem("userEmail", data.user.email);
      if (typeof data.user?.is_registered !== "undefined")
        localStorage.setItem("userRegistered", data.user.is_registered ? "true" : "false");

      setRegistered(localStorage.getItem("userRegistered") === "true");
      setEditingEmail(false);
      alert("Email saved.");
    } catch (err) {
      console.error("Save email error:", err);
      // conflict/email-in-use returns 409 with message
      alert(err?.message || "Could not save email. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        // call server logout (for audit). If it fails, still clear client state.
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch((e) => {
          console.warn("Server logout failed (ignored):", e);
        });
      }
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      // clear all auth keys locally
      localStorage.removeItem("token");
      localStorage.removeItem("userName");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userRegistered");
      localStorage.removeItem("isLoggedIn");
      navigate("/", { replace: true });
    }
  };

  const deleteAccount = () => {
    const ok = window.confirm(
      "Delete local account? This removes local profile data (name, email). This cannot be undone."
    );
    if (!ok) return;
    // NOTE: you don't currently have a server-side delete endpoint.
    // We remove client state only. If you want a server-side delete, I can add it.
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRegistered");
    localStorage.removeItem("token");
    localStorage.removeItem("isLoggedIn");
    navigate("/", { replace: true });
  };

  const exportProfile = () => {
    const payload = {
      name: localStorage.getItem("userName") || "",
      email: localStorage.getItem("userEmail") || "",
      registered: localStorage.getItem("userRegistered") === "true",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "profile_export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="profile-page">
      <div className="profile-card">
        {/* LEFT COLUMN */}
        <div className="profile-left">
          <div className="profile-header">
            <h2>Profile</h2>
          </div>

          <div className="form-row">
            <label className="field-label">Display name</label>
            <input
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            <button className="btn primary" onClick={saveName} disabled={saving}>
              {saving ? "Saving..." : "Save name"}
            </button>
          </div>

          <div className="email-section-mobile">
            <label className="field-label">Email</label>
            {!registered && !editingEmail && (
              <>
                <p className="help">Email is required the first time to link your data.</p>
                <input
                  className="text-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email (first time)"
                />
                <button className="btn small" onClick={saveEmail} disabled={saving}>
                  {saving ? "Saving..." : "Save email"}
                </button>
              </>
            )}
            {registered && !editingEmail && (
              <>
                <p className="email-display">{email || "Not set"}</p>
                <button className="btn small" onClick={startEditEmail}>
                  Edit email
                </button>
              </>
            )}
            {editingEmail && (
              <>
                <input
                  className="text-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="New email"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn small" onClick={saveEmail} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button className="btn muted" onClick={cancelEditEmail}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="footer-actions">
            <button className="btn danger" onClick={deleteAccount}>
              Delete account
            </button>
            <button className="btn outline" onClick={logout}>
              Logout
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={exportProfile}>
              Export
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN (preview + email desktop) */}
        <div className="profile-right">
          <div className="profile-preview">
            <div className="avatar">{initials}</div>
            <div className="preview-meta">
              <div className="preview-role">Mind Care</div>
              <div className="preview-name">{name || "User"}</div>
            </div>
          </div>

          <div className="right-content email-desktop">
            <label className="field-label">Email</label>
            {registered && !editingEmail && (
              <>
                <p className="email-display">{email || "Not set"}</p>
                <button className="btn small" onClick={startEditEmail}>
                  Edit email
                </button>
              </>
            )}
            {!registered && !editingEmail && (
              <>
                <p className="help">Email is required the first time to link your data.</p>
                <input
                  className="text-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email (first time)"
                />
                <button className="btn small" onClick={saveEmail} disabled={saving}>
                  {saving ? "Saving..." : "Save email"}
                </button>
              </>
            )}
            {editingEmail && (
              <>
                <input
                  className="text-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="New email"
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn small" onClick={saveEmail} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button className="btn muted" onClick={cancelEditEmail}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
