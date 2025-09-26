// src/components/Chatbot.jsx
import React, { useState, useRef, useEffect } from "react";
import "./css/Chatbot.css";
import { getResponse as localGetResponse } from "../components/intentMatcher"; // local fallback
import { format } from "date-fns";

const API_BASE =
  process.env.REACT_APP_API_BASE || "http://localhost:3001/api/chat";

// Helper to format time
const timeLabel = (iso) => {
  try {
    return format(new Date(iso), "HH:mm");
  } catch {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }
};

function getAuthToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("auth_token") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("mh_token") ||
    null
  );
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Chatbot() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const openRequestRef = useRef({ reqId: 0, controller: null });

  // Fetch conversations on mount
  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on changes
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversations, activeId, isBotTyping]);

  // Persist last active in case backend is not used
  useEffect(() => {
    if (activeId) localStorage.setItem("mh_active_conversation", JSON.stringify(activeId));
  }, [activeId]);

  // dedupe helper
  function dedupeConversations(list) {
    const seen = new Set();
    const out = [];
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }

  async function loadConversations() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const convs = data.map((c) => ({
        id: c.id || String(c.id),
        title: c.title || "Conversation",
        messages:
          c.messages && Array.isArray(c.messages) && c.messages.length
            ? [...c.messages]
                .sort(
                  (a, b) =>
                    new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt)
                )
                .map((m) => ({
                  id: m.id || m.messageId || `${m.created_at || m.createdAt}-${Math.random()}`,
                  sender: m.direction === "bot" ? "bot" : m.direction === "user" ? "user" : "system",
                  text: m.text,
                  createdAt: m.created_at || m.createdAt || new Date().toISOString(),
                }))
            : [],
        updatedAt: c.updated_at || c.updatedAt || new Date().toISOString(),
      }));

      const deduped = dedupeConversations(convs);
      setConversations(deduped);
      if (!activeId && deduped.length) setActiveId(deduped[0].id);
      // persist loaded list for offline fallback
      localStorage.setItem("mh_conversations_v1", JSON.stringify(deduped));
    } catch (err) {
      console.warn("Could not load conversations from API, falling back to localStorage. ", err);
      const raw = localStorage.getItem("mh_conversations_v1");
      const stored = raw ? JSON.parse(raw) : [];
      setConversations(stored);
      const rawActive = localStorage.getItem("mh_active_conversation");
      if (rawActive && !activeId) setActiveId(JSON.parse(rawActive));
    } finally {
      setLoading(false);
    }
  }

  // Create conversation via API, otherwise local fallback
  // Accept optional tempId to avoid creating duplicate temp entries
  async function createConversation(title = "New conversation", tempId = null) {
    const now = Date.now();
    const tempIdFinal = tempId || `c-${now}`;
    const conv = {
      id: tempIdFinal,
      title,
      messages: [
        {
          id: `msg-${now}`,
          sender: "bot",
          text: "👋 Hi! I’m your Mental Health Companion. How are you feeling today?",
          createdAt: new Date(now).toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
      __tempCreatedAt: now
    };

    // If no tempId given, optimistic insert
    if (!tempId) {
      setConversations((prev) => {
        const newList = [conv, ...prev];
        localStorage.setItem("mh_conversations_v1", JSON.stringify(newList));
        return newList;
      });
      setActiveId(tempIdFinal);
    } else {
      // tempId provided: ensure we keep the existing optimistic element
      setActiveId(tempIdFinal);
    }

    // If no auth token, do not call server — operate locally
    const token = getAuthToken();
    console.log(token,"-->>>")
    if (!token) {
      // keep local-only conversation
      console.info("No auth token found — creating conversation locally only.");
      return tempIdFinal;
    }

    try {
      const res = await fetch(`${API_BASE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        // server returned error — throw so catch handles fallback
        const text = await res.text().catch(() => null);
        throw new Error(`Create conversation failed: ${res.status} ${text || ""}`);
      }

      const created = await res.json();

      const serverConv = {
        id: created.id || String(created.id),
        title: created.title || title,
        messages:
          created.messages && Array.isArray(created.messages)
            ? created.messages
                .sort((a, b) => new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt))
                .map((m) => ({
                  id: m.id || m.messageId || `${m.created_at || m.createdAt}-${Math.random()}`,
                  sender: m.direction === "bot" ? "bot" : m.direction === "user" ? "user" : "system",
                  text: m.text,
                  createdAt: m.created_at || m.createdAt || new Date().toISOString(),
                }))
            : conv.messages,
        updatedAt: created.updated_at || created.updatedAt || new Date().toISOString(),
      };

      // replace temp with server using functional update and persist
      setConversations((prev) => {
        const nowTs = Date.now();
        const filtered = prev.filter(c => {
          // remove exact tempId
          if (c.id === tempIdFinal) return false;
          // remove any duplicate server id (we'll add serverConv)
          if (c.id === serverConv.id) return false;
          // remove very old client temps (>5min)
          if (typeof c.id === "string" && c.id.startsWith("c-")) {
            const parts = c.id.split("-");
            const ts = Number(parts[1]);
            if (!Number.isNaN(ts) && (nowTs - ts) > 5 * 60 * 1000) return false;
          }
          return true;
        });
        const newList = [serverConv, ...filtered];
        localStorage.setItem("mh_conversations_v1", JSON.stringify(newList));
        return newList;
      });

      // ensure we open the created server conversation
      setActiveId(serverConv.id);
      return serverConv.id;
    } catch (err) {
      console.error("createConversation error:", err);
      // ensure local optimistic item persisted
      setConversations((prev) => {
        if (!prev.some((c) => c.id === tempIdFinal)) {
          const newList = [conv, ...prev];
          localStorage.setItem("mh_conversations_v1", JSON.stringify(newList));
          return newList;
        }
        localStorage.setItem("mh_conversations_v1", JSON.stringify(prev));
        return prev;
      });
      // return temp id so caller can still operate offline
      return tempIdFinal;
    }
  }

  // Delete conversation (API or local)
  async function deleteConversation(id) {
    // optimistic remove
    let previous;
    setConversations((prev) => {
      previous = prev;
      const newList = prev.filter((c) => c.id !== id);
      localStorage.setItem("mh_conversations_v1", JSON.stringify(newList));
      return newList;
    });

    if (id === activeId) {
      setActiveId((prevId) => {
        const remaining = previous.filter((c) => c.id !== id);
        return remaining.length ? remaining[0].id : null;
      });
    }

    try {
      // If id is a temp id or no token, skip server DELETE
      const token = getAuthToken();
      if (!token || String(id).startsWith("c-")) {
        return true;
      }

      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return true;
    } catch (err) {
      console.warn("Delete conv failed, restored local copy.", err);
      setConversations(previous);
      localStorage.setItem("mh_conversations_v1", JSON.stringify(previous));
      return false;
    }
  }

  // openConversation with abortable request and stale-response guard
  async function openConversation(id) {
    // if this is a local/temp conversation id, there's nothing to fetch from server
    if (String(id).startsWith("c-")) {
      setActiveId(id);
      return;
    }

    setActiveId(id);

    const reqId = ++openRequestRef.current.reqId;
    if (openRequestRef.current.controller) {
      try { openRequestRef.current.controller.abort(); } catch (e) {}
    }
    const controller = new AbortController();
    openRequestRef.current.controller = controller;

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        signal: controller.signal,
      });

      if (!res) return;
      if (!res.ok) {
        console.warn(`openConversation fetch failed: ${res.status}`);
        return;
      }

      const conv = await res.json();
      if (reqId !== openRequestRef.current.reqId) return; // stale

      const mapped = {
        id: conv.id || String(conv.id),
        title: conv.title || "Conversation",
        messages:
          conv.messages && Array.isArray(conv.messages)
            ? conv.messages
                .sort((a, b) => new Date(a.created_at || a.createdAt) - new Date(b.created_at || b.createdAt))
                .map((m) => ({
                  id: m.id || m.messageId || `${m.created_at || m.createdAt}-${Math.random()}`,
                  sender: m.direction === "bot" ? "bot" : m.direction === "user" ? "user" : "system",
                  text: m.text,
                  createdAt: m.created_at || m.createdAt || new Date().toISOString(),
                }))
            : [],
        updatedAt: conv.updated_at || conv.updatedAt || new Date().toISOString(),
      };

      setConversations((prev) => {
        const others = prev.filter((p) => p.id !== mapped.id);
        const newList = [mapped, ...others];
        localStorage.setItem("mh_conversations_v1", JSON.stringify(newList));
        return newList;
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      console.warn("Could not fetch conversation details, using local copy if available.", err);
    } finally {
      if (openRequestRef.current.controller === controller) openRequestRef.current.controller = null;
    }
  }

  // Send message (API) and handle bot reply returned by server
  async function addMessageApi(convId, direction = "user", text, meta = null) {
    if (!text || !text.trim()) return;
    const createdAtISOString = new Date().toISOString();

    const userMsg = { id: `local-${Date.now()}-${Math.random()}`, sender: "user", text, createdAt: createdAtISOString };

    // Optimistic UI update for user's message
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, userMsg], updatedAt: new Date().toISOString() }
          : c
      );
      localStorage.setItem("mh_conversations_v1", JSON.stringify(updated));
      return updated;
    });

    setIsBotTyping(true);

    try {
      // If convId is a local temp id or there's no token, skip server POST and use local matcher
      const token = getAuthToken();
      if (!token || String(convId).startsWith("c-")) {
        const localReply = localGetResponse(text, { fallbackThreshold: 0.28 });
        const botMsg = { id: `local-bot-${Date.now()}`, sender: "bot", text: localReply.response || "Sorry, I didn't understand that.", createdAt: new Date().toISOString() };
        setConversations((prev) => {
          const updated = prev.map((c) =>
            c.id === convId ? { ...c, messages: [...c.messages, botMsg], updatedAt: new Date().toISOString() } : c
          );
          localStorage.setItem("mh_conversations_v1", JSON.stringify(updated));
          return updated;
        });
        setIsBotTyping(false);
        return { success: false, bot: botMsg };
      }

      const res = await fetch(`${API_BASE}/${encodeURIComponent(convId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ direction, text, meta }),
      });

      if (!res.ok) throw new Error(`Status ${res.status}`);

      const payload = await res.json();
      const bot = payload.bot;
      let botMsg;

      if (bot) {
        botMsg = {
          id: bot.id || `local-bot-${Date.now()}`,
          sender: "bot",
          text: bot.text,
          createdAt: bot.created_at || new Date().toISOString(),
        };
      } else {
        // server didn't produce bot reply -> fallback to local matcher
        const fallback = localGetResponse(text, { fallbackThreshold: 0.25 }).response;
        botMsg = { id: `local-bot-${Date.now()}`, sender: "bot", text: fallback, createdAt: new Date().toISOString() };
      }

      // append bot message
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === convId ? { ...c, messages: [...c.messages, botMsg], updatedAt: new Date().toISOString() } : c
        );
        localStorage.setItem("mh_conversations_v1", JSON.stringify(updated));
        return updated;
      });

      setIsBotTyping(false);
      return { success: true, bot: botMsg };
    } catch (err) {
      console.warn("Message send failed to API, using local matcher fallback.", err);
      const localReply = localGetResponse(text, { fallbackThreshold: 0.28 });
      const botMsg = { id: `local-bot-${Date.now()}`, sender: "bot", text: localReply.response || "Sorry, I didn't understand that.", createdAt: new Date().toISOString() };

      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === convId ? { ...c, messages: [...c.messages, botMsg], updatedAt: new Date().toISOString() } : c
        );
        localStorage.setItem("mh_conversations_v1", JSON.stringify(updated));
        return updated;
      });

      setIsBotTyping(false);
      return { success: false, bot: botMsg };
    }
  }

  // handle send from UI
  async function handleSend(e) {
    e && e.preventDefault();
    const text = input.trim();
    if (!text || !activeId) return;

    setInput("");
    inputRef.current?.focus();

    // If activeId is a temp id, create server conversation and then send
    if (String(activeId).startsWith("c-")) {
      try {
        const localConv = conversations.find((c) => c.id === activeId);
        // call createConversation with tempId to reuse optimistic entry
        const createdId = await createConversation(localConv?.title || "Conversation", activeId);
        // Only call addMessageApi with createdId (server id) or fall back to local behavior handled inside addMessageApi
        await addMessageApi(createdId, "user", text);
      } catch (err) {
        console.warn("Failed to create conversation or send message:", err);
        // fallback attempt to send to temp id (local fallback inside addMessageApi)
        try {
          await addMessageApi(activeId, "user", text);
        } catch (e) {
          console.warn("Fallback send also failed:", e);
        }
      } finally {
        setIsBotTyping(false);
      }
      return;
    }

    // Normal flow
    try {
      await addMessageApi(activeId, "user", text);
    } catch (err) {
      console.warn("addMessageApi failed:", err);
    } finally {
      setIsBotTyping(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) handleSend(e);
  }

  // Render helpers
  const convSnippet = (c) => {
    const last = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
    if (!last) return "";
    return (last.sender === "user" ? "You: " : "Bot: ") + (last.text.length > 40 ? last.text.slice(0, 37) + "..." : last.text);
  };

  const activeConversation = conversations.find((c) => c.id === activeId);

  

  return (
    <div className="chat-container">
      <aside className="conversations-panel">
        <div className="panel-header">
          <h3>Conversations</h3>
          <button
            className="btn small"
            onClick={async () => {
              // create and then open the server conversation (or temp if offline)
              const newId = await createConversation("New chat");
              // only open server conversations — if newId is client temp, openConversation will ignore fetching
              if (newId) openConversation(newId);
            }}
          >
            ＋ New
          </button>
        </div>

        {loading ? (
          <div className="conv-empty">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="conv-empty">No chats yet. Start a new one 💬</div>
        ) : (
          <ul className="conversations-list" role="list">
            {conversations.map((c) => (
              <li
                key={c.id}
                className={`conv-item ${c.id === activeId ? "active" : ""}`}
                onClick={() => { setActiveId(c.id); openConversation(c.id); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && (setActiveId(c.id), openConversation(c.id))}
              >
                <div className="conv-title">{c.title}</div>
                <div className="conv-sub">
                  <span className="conv-last">{convSnippet(c)}</span>
                  <button
                    className="btn-icon"
                    title="Delete conversation"
                    onClick={(ev) => { ev.stopPropagation(); deleteConversation(c.id); }}
                  >
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <main className="chat-main">
        <div className="chat-header">
          <h2>💬 Mental Health Chatbot</h2>
          <div className="chat-meta">
            {activeConversation ? (
              <span>
                Started:{" "}
                {activeConversation.messages[0]
                  ? timeLabel(activeConversation.messages[0].createdAt)
                  : "—"}
              </span>
            ) : (
              <span>No conversation selected</span>
            )}
          </div>
        </div>

        <div className="chat-messages" ref={messagesRef}>
          {activeConversation && activeConversation.messages.length ? (
            activeConversation.messages.map((m) => (
              <div key={m.id || m.createdAt} className={`message ${m.sender}`}>
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
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
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
          />
          <button type="submit" className="send-btn">➤</button>
        </form>
      </main>
    </div>
  );
}
