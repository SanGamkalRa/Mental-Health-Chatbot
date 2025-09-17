// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Chatbot from "./components/Chatbot";
import MoodTracker from "./components/MoodTracker";
import Layout from "./components/Layout";
import Profile from "./components/Profile";

function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Login />} />

        {/* Protected layout (Layout must render <Outlet />) */}
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chatbot" element={<Chatbot />} />
          <Route path="/mood-tracker" element={<MoodTracker />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Any unknown route -> login (or change to /dashboard if you prefer) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
