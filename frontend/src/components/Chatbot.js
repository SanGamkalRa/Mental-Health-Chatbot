import React, { useState, useRef, useEffect } from "react";
import "./css/Chatbot.css";
import { getResponse } from "./intentMatcher"; // update path if needed
import { format } from "date-fns"; // optional: remove if not installed

// Helper to format time (fallback if date-fns not installed)
const timeLabel = (iso) => {
  try {
    return format(new Date(iso), "HH:mm");
  } catch {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
  }
};

export default function Chatbot() {
  // conversations: [{ id, title, messages: [{sender, text, createdAt}], updatedAt }]
  const [conversations, setConversations] = useState(() => {
    try {
      const raw = localStorage.getItem("mh_conversations_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [activeId, setActiveId] = useState(() => {
    const raw = localStorage.getItem("mh_active_conversation");
    return raw ? JSON.parse(raw) : null;
  });

  const [input, setInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);

  // Ensure there's always one open conversation
  useEffect(() => {
    if (!conversations.length) {
      const id = createConversation("Welcome");
      setActiveId(id);
    } else if (!activeId) {
      setActiveId(conversations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist conversations & active id
  useEffect(() => {
    localStorage.setItem("mh_conversations_v1", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem("mh_active_conversation", JSON.stringify(activeId));
  }, [activeId]);

  // scroll to bottom when messages change
  useEffect(() => {
    const el = messagesRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversations, activeId, isBotTyping]);

  function createConversation(title = "New conversation") {
    const id = `c-${Date.now()}`;
    const conv = {
      id,
      title,
      messages: [
        {
          sender: "bot",
          text: "👋 Hi! I’m your Mental Health Companion. How are you feeling today?",
          createdAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(id);
    return id;
  }

  function deleteConversation(id) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveId(remaining.length ? remaining[0].id : null);
    }
  }

  function updateConversationMessage(id, updater) {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = typeof updater === "function" ? updater(c) : updater;
        return { ...c, ...updated, updatedAt: new Date().toISOString() };
      })
    );
  }

  function handleSend(e) {
    e && e.preventDefault();
    const text = input.trim();
    if (!text || !activeId) return;
    const userMessage = {
      sender: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    // Optimistically add user message
    updateConversationMessage(activeId, (c) => ({
      messages: [...c.messages, userMessage],
    }));
    setInput("");
    inputRef.current?.focus();

    // call intent matcher (sync)
    const botResult = getResponse(text, { fallbackThreshold: 0.28 });
    console.debug("Intent match:", botResult.tag, "score:", botResult.score);

    // Show typing indicator then append bot reply
    setIsBotTyping(true);
    const simulatedDelay = Math.max(400, 300 + Math.min(1200, text.length * 20));
    setTimeout(() => {
      const botMessage = {
        sender: "bot",
        text: botResult.response,
        createdAt: new Date().toISOString(),
      };
      updateConversationMessage(activeId, (c) => ({
        messages: [...c.messages, botMessage],
      }));
      setIsBotTyping(false);
    }, simulatedDelay);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(e);
    }
  }

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div className="chat-container">
      <aside className="conversations-panel">
        <div className="panel-header">
          <h3>Conversations</h3>
          <button className="btn small" onClick={() => createConversation("New chat")}>＋ New</button>
        </div>

        <ul className="conversations-list" role="list">
          {conversations.map((c) => {
            const last = c.messages[c.messages.length - 1];
            return (
              <li
                key={c.id}
                className={`conv-item ${c.id === activeId ? "active" : ""}`}
                onClick={() => setActiveId(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setActiveId(c.id)}
                aria-label={`Open conversation ${c.title}`}
              >
                <div className="conv-title">{c.title}</div>
                <div className="conv-sub">
                  <span className="conv-last">{last ? (last.sender === "user" ? "You: " : "Bot: ") + (last.text.slice(0, 40)) : ""}</span>
                  <button
                    className="btn-icon"
                    title="Delete conversation"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    aria-label={`Delete conversation ${c.title}`}
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="chat-main" aria-live="polite">
        <div className="chat-header">
          <h2>💬 Mental Health Chatbot</h2>
          <div className="chat-meta">
            {activeConversation ? (
              <span>Started: {timeLabel(activeConversation.messages[0].createdAt)}</span>
            ) : (
              <span>No conversation selected</span>
            )}
          </div>
        </div>

        <div className="chat-messages" ref={messagesRef}>
          {activeConversation && activeConversation.messages.length ? (
            activeConversation.messages.map((m, i) => (
              <div key={i} className={`message ${m.sender}`} aria-live="off">
                <div className="bubble">
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">
                    <span className="time">{timeLabel(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No messages — start the conversation!</div>
          )}
          {isBotTyping && (
            <div className="message bot typing">
              <div className="bubble">
                <div className="typing-dots" aria-hidden>
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <form className="chat-input" onSubmit={handleSend}>
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Type your message... (Shift+Enter for newline)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Chat message"
          />
          <button type="submit" aria-label="Send message" className="send-btn">➤</button>
        </form>
      </main>
    </div>
  );
}
