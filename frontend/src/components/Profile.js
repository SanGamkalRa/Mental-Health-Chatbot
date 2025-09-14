// src/Profile.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./css/Profile.css";

export default function Profile() {
  const navigate = useNavigate();

  const [name, setName] = useState(localStorage.getItem("userName") || "");
  const [email, setEmail] = useState(localStorage.getItem("userEmail") || "");
  const [registered, setRegistered] = useState(localStorage.getItem("userRegistered") === "true");
  const [editingEmail, setEditingEmail] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("isLoggedIn") !== "true") {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const initials =
    (name || "")
      .split(" ")
      .filter(Boolean)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  const saveName = () => {
    if (!name.trim()) {
      alert("Name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem("userName", name.trim());
      alert("Name saved.");
    } catch (err) {
      console.error(err);
      alert("Could not save name.");
    } finally {
      setSaving(false);
    }
  };

  const startEditEmail = () => setEditingEmail(true);
  const cancelEditEmail = () => {
    setEmail(localStorage.getItem("userEmail") || "");
    setEditingEmail(false);
  };

  const saveEmail = () => {
    if (!email.trim() || !email.includes("@")) {
      alert("Please enter a valid email.");
      return;
    }
    setSaving(true);
    try {
      localStorage.setItem("userEmail", email.trim());
      localStorage.setItem("userRegistered", "true");
      setRegistered(true);
      setEditingEmail(false);
      alert("Email saved.");
    } catch (err) {
      console.error(err);
      alert("Could not save email.");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("isLoggedIn");
    navigate("/", { replace: true });
  };

  const deleteAccount = () => {
    const ok = window.confirm(
      "Delete local account? This removes local profile data (name, email). This cannot be undone."
    );
    if (!ok) return;
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userRegistered");
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
            {/* Save name button moved here */}
            
            <button className="btn primary" onClick={saveName} disabled={saving}>
              {saving ? "Saving..." : "Save name"}
            </button>
          </div>

          {/* Mobile email area */}
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
                <button className="btn small" onClick={startEditEmail}>Edit email</button>
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

          {/* Actions */}
          <div className="footer-actions">
            <button className="btn danger" onClick={deleteAccount}>Delete account</button>
            <button className="btn outline" onClick={logout}>Logout</button>
            <div style={{ flex: 1 }} />
          
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
                <button className="btn small" onClick={startEditEmail}>Edit email</button>
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
                  <button className="btn muted" onClick={cancelEditEmail}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
