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
  // try common localStorage keys (adjust if your app uses a different key)
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
    if (activeId)
      localStorage.setItem("mh_active_conversation", JSON.stringify(activeId));
  }, [activeId]);

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
      // normalize: ensure messages array present
      const convs = data.map((c) => ({
        id: c.id || c.id?.toString() || c.id,
        title: c.title || "Conversation",
        messages:
          c.messages && Array.isArray(c.messages) && c.messages.length
            ? // server returns messages possibly in descending order; sort by created_at if available
              [...c.messages]
                .sort(
                  (a, b) =>
                    new Date(a.created_at || a.createdAt) -
                    new Date(b.created_at || b.createdAt)
                )
                .map((m) => ({
                  sender:
                    m.direction === "bot"
                      ? "bot"
                      : m.direction === "user"
                      ? "user"
                      : "system",
                  text: m.text,
                  createdAt:
                    m.created_at || m.createdAt || new Date().toISOString(),
                }))
            : [],
        updatedAt: c.updated_at || c.updatedAt || new Date().toISOString(),
      }));
      setConversations(convs);
      if (!activeId && convs.length) setActiveId(convs[0].id);
    } catch (err) {
      // server unreachable or auth problem -> fallback to local storage
      console.warn(
        "Could not load conversations from API, falling back to localStorage. ",
        err
      );
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
  async function createConversation(title = "New conversation") {
    const tempId = `c-${Date.now()}`;
    const conv = {
      id: tempId,
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

    // optimistic UI
    setConversations((prev) => [conv, ...prev]);
    setActiveId(tempId);

    try {
      const res = await fetch(`${API_BASE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const created = await res.json();
      // map server conv to client shape
      const serverConv = {
        id: created.id || created.id?.toString(),
        title: created.title || title,
        messages:
          created.messages && Array.isArray(created.messages)
            ? created.messages
                .sort(
                  (a, b) =>
                    new Date(a.created_at || a.createdAt) -
                    new Date(b.created_at || b.createdAt)
                )
                .map((m) => ({
                  sender:
                    m.direction === "bot"
                      ? "bot"
                      : m.direction === "user"
                      ? "user"
                      : "system",
                  text: m.text,
                  createdAt:
                    m.created_at || m.createdAt || new Date().toISOString(),
                }))
            : conv.messages,
        updatedAt:
          created.updated_at || created.updatedAt || new Date().toISOString(),
      };

      // replace temp with server
      setConversations((prev) => [
        serverConv,
        ...prev.filter((c) => c.id !== tempId),
      ]);
      setActiveId(serverConv.id);
      // persist local copy
      localStorage.setItem(
        "mh_conversations_v1",
        JSON.stringify([
          serverConv,
          ...conversations.filter((c) => c.id !== tempId),
        ])
      );
      return serverConv.id;
    } catch (err) {
      console.warn("Create convo failed, kept local copy.", err);
      // keep optimistic conv in localStorage
      localStorage.setItem(
        "mh_conversations_v1",
        JSON.stringify([conv, ...conversations])
      );
      return tempId;
    }
  }

  // Delete conversation (API or local)
  async function deleteConversation(id) {
    // optimistic remove
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === activeId) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveId(remaining.length ? remaining[0].id : null);
    }

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      // success
      localStorage.setItem(
        "mh_conversations_v1",
        JSON.stringify(conversations.filter((c) => c.id !== id))
      );
      return true;
    } catch (err) {
      console.warn("Delete conv failed, restored local copy.", err);
      setConversations(previous);
      return false;
    }
  }

  // inside Chatbot component top-level (add these refs)
  const openRequestRef = useRef({ reqId: 0, controller: null });

  // updated openConversation function
  async function openConversation(id) {
    // immediate visual selection (stable)
    setActiveId(id);

    // increment request id and abort previous in-flight request
    const reqId = ++openRequestRef.current.reqId;
    if (openRequestRef.current.controller) {
      try {
        openRequestRef.current.controller.abort();
      } catch (e) {}
    }
    const controller = new AbortController();
    openRequestRef.current.controller = controller;

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        signal: controller.signal,
      });

      // if call was aborted, just return
      if (!res) return;
      if (!res.ok) {
        // don't overwrite UI on errors; keep local selection
        console.warn(`openConversation fetch failed: ${res.status}`);
        return;
      }

      const conv = await res.json();

      // If another request started after this one, ignore this response
      if (reqId !== openRequestRef.current.reqId) {
        // stale response
        return;
      }

      const mapped = {
        id: conv.id || conv.id?.toString(),
        title: conv.title || "Conversation",
        messages:
          conv.messages && Array.isArray(conv.messages)
            ? conv.messages
                .sort(
                  (a, b) =>
                    new Date(a.created_at || a.createdAt) -
                    new Date(b.created_at || b.createdAt)
                )
                .map((m) => ({
                  sender:
                    m.direction === "bot"
                      ? "bot"
                      : m.direction === "user"
                      ? "user"
                      : "system",
                  text: m.text,
                  createdAt:
                    m.created_at || m.createdAt || new Date().toISOString(),
                }))
            : [],
        updatedAt:
          conv.updated_at || conv.updatedAt || new Date().toISOString(),
      };

      // replace or insert without changing the activeId
      setConversations((prev) => {
        const others = prev.filter((p) => p.id !== mapped.id);
        return [mapped, ...others];
      });

      // Keep activeId as-is (user clicked it already); no setActiveId here to avoid flicker
    } catch (err) {
      if (err.name === "AbortError") {
        // expected when requests are cancelled
        return;
      }
      console.warn(
        "Could not fetch conversation details, using local copy if available.",
        err
      );
    } finally {
      // clear controller only if it is this controller
      if (openRequestRef.current.controller === controller) {
        openRequestRef.current.controller = null;
      }
    }
  }

  // Send message (API) and handle bot reply returned by server
  async function addMessageApi(convId, direction = "user", text, meta = null) {
    if (!text || !text.trim()) return;
    const createdAt = new Date().toISOString();

    // Optimistic user message update
    const userMsg = { sender: "user", text, createdAt };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, userMsg],
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );
    setIsBotTyping(true);

    try {
      const res = await fetch(
        `${API_BASE}/${encodeURIComponent(convId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ direction, text, meta }),
        }
      );

      if (!res.ok) {
        // if server returned 4xx/5xx -> fallback to local intent matcher to produce a bot response
        throw new Error(`Status ${res.status}`);
      }

      const payload = await res.json();
      // payload: { message: created, bot: botMessage } as per your controller
      const bot = payload.bot;
      let botMsg;
      if (bot) {
        botMsg = {
          sender: "bot",
          text: bot.text,
          createdAt:
            bot.created_at || bot.createdAt || new Date().toISOString(),
        };
      } else {
        // server didn't produce bot reply -> fallback to server-side or local generation
        const fallback =
          payload.message && payload.message.text
            ? localGetResponse(text, { fallbackThreshold: 0.25 }).response
            : localGetResponse(text).response;
        botMsg = {
          sender: "bot",
          text: fallback,
          createdAt: new Date().toISOString(),
        };
      }

      // Append bot message returned by server
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, botMsg],
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
      setIsBotTyping(false);
      return { success: true, bot: botMsg };
    } catch (err) {
      console.warn(
        "Message send failed to API, using local matcher fallback.",
        err
      );
      // produce a local bot reply (client-side intent matcher)
      const localReply = localGetResponse(text, { fallbackThreshold: 0.28 });
      const botMsg = {
        sender: "bot",
        text: localReply.response || "Sorry, I didn't understand that.",
        createdAt: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, botMsg],
                updatedAt: new Date().toISOString(),
              }
            : c
        )
      );
      setIsBotTyping(false);
      // persist to localStorage for offline mode
      const store = conversations.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, userMsg, botMsg] }
          : c
      );
      localStorage.setItem("mh_conversations_v1", JSON.stringify(store));
      return { success: false, bot: botMsg };
    }
  }

  // handle send from UI
 // handle send from UI (replace existing handleSend)
async function handleSend(e) {
  e && e.preventDefault();
  const text = input.trim();
  if (!text || !activeId) return;

  // clear input and keep focus
  setInput("");
  inputRef.current?.focus();

  const createdAt = new Date().toISOString();
  const userMsg = { sender: "user", text, createdAt };

  // Optimistically append the user's message to the active conversation
  setConversations((prev) =>
    prev.map((c) =>
      c.id === activeId
        ? {
            ...c,
            messages: [...c.messages, userMsg],
            updatedAt: new Date().toISOString(),
          }
        : c
    )
  );

  // Indicate bot is typing until we get a reply (or fallback finishes)
  setIsBotTyping(true);

  // If this conversation is a temporary client-side id (starts with "c-"),
  // create it on the server first and use the returned id to post the message.
  if (String(activeId).startsWith("c-")) {
    try {
      // Find local conversation data (may be undefined but fine)
      const localConv = conversations.find((c) => c.id === activeId);

      // createConversation returns the new id (server id or the same temp id on failure)
      const createdId = await createConversation(localConv?.title || "Conversation");

      // Use the returned id to post the message to the correct conversation on server
      await addMessageApi(createdId, "user", text);
    } catch (err) {
      // Best-effort fallback: if creation or send fails, try sending against the temp id
      console.warn("Failed to create conversation or send message:", err);
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

  // Normal flow: existing (server) conversation id
  try {
    await addMessageApi(activeId, "user", text);
  } catch (err) {
    // addMessageApi already handles local fallback, but log for debugging
    console.warn("addMessageApi failed:", err);
  } finally {
    // ensure typing indicator is cleared (addMessageApi also clears it on success/fallback)
    setIsBotTyping(false);
  }
}


  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) handleSend(e);
  }

  // convenience to render snippet of last message
  const convSnippet = (c) => {
    const last =
      c.messages && c.messages.length
        ? c.messages[c.messages.length - 1]
        : null;
    if (!last) return "";
    return (
      (last.sender === "user" ? "You: " : "Bot: ") +
      (last.text.length > 40 ? last.text.slice(0, 37) + "..." : last.text)
    );
  };

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div className="chat-container">
      <aside className="conversations-panel">
        <div className="panel-header">
          <h3>Conversations</h3>
          <button
            className="btn small"
            onClick={() => {
              createConversation("New chat");
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
                // key={c.id}
                className={`conv-item ${c.id === activeId ? "active" : ""}`}
                onClick={() => {
                  // immediate selection to avoid UI flicker
                  setActiveId(c.id);
                  // then fetch latest messages in background (safe)
                  openConversation(c.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  (setActiveId(c.id), openConversation(c.id))
                }
              >
                <div className="conv-title">{c.title}</div>
                <div className="conv-sub">
                  <span className="conv-last">{convSnippet(c)}</span>
                  <button
                    className="btn-icon"
                    title="Delete conversation"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      deleteConversation(c.id);
                    }}
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
            activeConversation.messages.map((m, i) => (
              <div key={i} className={`message ${m.sender}`}>
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
          <button type="submit" className="send-btn">
            ➤
          </button>
        </form>
      </main>
    </div>
  );
}
