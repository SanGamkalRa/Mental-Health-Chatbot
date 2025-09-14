// src/components/Chatbot.js
import React, { useState, useRef, useEffect } from "react";
import "./css/Chatbot.css";
import { getResponse } from "../components/intentMatcher"; // path from components -> src/intentMatcher.js

export default function Chatbot() {
  const [messages, setMessages] = useState([
    { sender: "bot", text: "👋 Hi! I’m your Mental Health Companion. How are you feeling today?" }
  ]);
  const [input, setInput] = useState("");
  const messagesRef = useRef(null);

  // auto-scroll to bottom when messages update
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSend = (e) => {
    e && e.preventDefault();
    const text = input.trim();
    if (!text) return;

    // add user message immediately
    const userMessage = { sender: "user", text };
    setMessages((prev) => [...prev, userMessage]);

    // compute bot response using intent matcher (sync, client-side)
    const botResult = getResponse(text, { fallbackThreshold: 0.28 }); // tweak threshold as needed
    // optional: you can inspect confidence in console
    console.debug("Intent match:", botResult.tag, "score:", botResult.score);

    // small delay to simulate typing
    setTimeout(() => {
      const botMessage = { sender: "bot", text: botResult.response };
      setMessages((prev) => [...prev, botMessage]);
    }, 500);

    setInput("");
  };

  // allow Enter to send
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(e);
    }
  };

  return (
    <div className="chat-wrapper">
      {/* Header */}
      <div className="chat-header">
        <h2>💬 Mental Health Chatbot</h2>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
      </div>

      {/* Input */}
      <form className="chat-input" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Chat message"
        />
        <button type="submit" aria-label="Send message">➤</button>
      </form>
    </div>
  );
}
