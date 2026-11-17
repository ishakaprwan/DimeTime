import { useEffect, useRef, useState } from "react";
import "./Assistant.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const suggestions = [
  "How much have I spent this month?",
  "Am I on track with my budget?",
  "What's coming up in the next two weeks?",
  "How busy is my week?",
];

const navigation = Object.freeze({
  dashboard: "Dashboard",
  transactions: "Transactions",
  budget: "Budget",
  "money-owed": "Money owed",
  planner: "Planner",
  academics: "Academics",
  settings: "Student settings",
});

export default function Assistant({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const launchRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (
      wasOpen.current &&
      panelRef.current?.contains(document.activeElement)
    ) {
      launchRef.current?.focus();
    }

    wasOpen.current = open;
  }, [open]);

  const closeAssistant = () => {
    setOpen(false);
    launchRef.current?.focus();
  };

  async function send(text) {
    const question = (text || input).trim();

    if (!question || busy) return;

    setMessages((previous) => [...previous, { role: "user", text: question }]);

    setInput("");
    setError("");
    setBusy(true);

    try {
      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("Please sign in again.");
      }

      const response = await fetch(`${API_URL}/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: question }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Assistant unavailable.");
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: data.answer,
          destination: Object.hasOwn(navigation, data.destination)
            ? data.destination
            : null,
        },
      ]);
    } catch (err) {
      setError(err.message || "Could not contact the assistant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dt-ai">
      <button
        ref={launchRef}
        className="dt-ai-launch"
        type="button"
        onClick={() => (open ? closeAssistant() : setOpen(true))}
        aria-controls="dt-assistant-panel"
        aria-expanded={open}
      >
        {open ? "Close assistant" : "Ask DimeTime"}
      </button>

      {open && (
        <section
          id="dt-assistant-panel"
          ref={panelRef}
          className="dt-ai-panel"
          aria-label="DimeTime student assistant"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closeAssistant();
            }
          }}
        >
          <header>
            <strong>DimeTime Assistant</strong>
          </header>

          <div
            className={`dt-ai-messages ${messages.length === 0 ? "dt-ai-messages-empty" : ""}`}
            aria-live="polite"
          >
            {messages.length === 0 && (
              <p>Your finances, deadlines and schedule, all in one place.</p>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`dt-ai-msg ${m.role}`}>
                <span>{m.text}</span>

                {m.role === "assistant" && m.destination && onNavigate && (
                  <button
                    type="button"
                    className="dt-ai-nav-button"
                    onClick={() => {
                      onNavigate(m.destination);
                      closeAssistant();
                    }}
                  >
                    Open {navigation[m.destination]}
                  </button>
                )}
              </div>
            ))}

            {busy && <p>Thinking…</p>}
          </div>

          {messages.length === 0 && (
            <div className="dt-ai-suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="dt-ai-error" role="alert">
              {error}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              aria-label="Ask DimeTime"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="Ask DimeTime anything..."
            />

            <button type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
        </section>
      )}
    </div>
  );
}