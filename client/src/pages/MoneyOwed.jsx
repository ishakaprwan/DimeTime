import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrency } from "../currency";
import { displayDate, localISODate } from "../dateFormat";
import "./MoneyOwed.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// default values for adding a new money owed record
const emptyForm = () => ({
  direction: "owed_to_me",
  person: "",
  reason: "",
  amount: "",
  recorded_on: localISODate(),
});

// check the entered amount is valid + within the allowed limit
const validAmount = (value) =>
  /^\d+(?:\.\d{1,2})?$/.test(value) &&
  Number(value) > 0 &&
  Number(value) <= 9999999999.99;

// money owed page to keep track of what others owe you + what you owe them
export default function MoneyOwed({ onBack, onOpenTransactions }) {
  const { format } = useCurrency();
  const editorRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("outstanding");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [repaymentId, setRepaymentId] = useState(null);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(localISODate());
  const [historyId, setHistoryId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // shared API request for money owed records using the user's login token
  const request = useCallback(async (path = "", options = {}) => {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API}/money-owed${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error || "Could not complete your request.");
    return data;
  }, []);

  // fetch saved records from the API + update the page
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await request();
      setRecords(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  // load records when the page opens
  useEffect(() => {
    Promise.resolve().then(() => load());
  }, [load]);

  // scroll to the form when adding or editing a record
  useEffect(() => {
    if (showForm)
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showForm, editingId]);

  // calculate the total still owed in both directions, excluding settled balance
  const totals = useMemo(
    () =>
      records.reduce(
        (acc, record) => {
          const remaining = Number(record.remaining_amount);
          if (remaining > 0) acc[record.direction] += remaining;
          return acc;
        },
        { owed_to_me: 0, i_owe: 0 },
      ),
    [records],
  );

  // filter records based on the selected filter
  const visible = records.filter(
    (record) =>
      filter === "all" ||
      (filter === "settled"
        ? Number(record.remaining_amount) <= 0
        : Number(record.remaining_amount) > 0),
  );

  // clear the form + any previous editing state for a new record
  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setRepaymentId(null);
    setMessage("");
    setError("");
  }

  // fill the form with an existing record's details for editing
  function startEdit(record) {
    setEditingId(record.id);
    setForm({
      direction: record.direction,
      person: record.person,
      reason: record.reason,
      amount: record.original_amount,
      recorded_on: record.recorded_on,
    });
    setShowForm(true);
    setRepaymentId(null);
    setError("");
    setMessage("");
  }

  // validate the form + send the record to the API, either adding/updating it
  async function save(event) {
    event.preventDefault();
    if (!form.person.trim() || !validAmount(form.amount) || !form.recorded_on) {
      setError("Enter a name, valid amount and date.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await request(editingId ? `/${editingId}` : "", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          person: form.person.trim(),
          reason: form.reason.trim(),
        }),
      });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
      setMessage(editingId ? "Record updated." : "Record added.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // handle repayment submissions
  async function repay(event) {
    event.preventDefault();
    const record = records.find((item) => item.id === repaymentId);
    if (
      !record ||
      !validAmount(repaymentAmount) ||
      Math.round(Number(repaymentAmount) * 100) >
        Math.round(Number(record.remaining_amount) * 100)
    ) {
      setError("Enter an amount no greater than the balance outstanding.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await request(`/${repaymentId}/repayments`, {
        method: "POST",
        body: JSON.stringify({
          amount: repaymentAmount,
          paid_on: repaymentDate,
        }),
      });
      setRepaymentId(null);
      setRepaymentAmount("");
      await load();
      setMessage("Repayment saved.");
      if (historyId === record.id) {
        setHistoryId(null);
        setHistory([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // confirm before deleting the record + its repayment history
  async function remove(record) {
    if (
      !window.confirm(
        `Delete the record for ${record.person}? This also deletes its repayment history.`,
      )
    )
      return;
    try {
      setBusy(true);
      setError("");
      setMessage("");
      await request(`/${record.id}`, { method: "DELETE" });
      if (historyId === record.id) {
        setHistoryId(null);
        setHistory([]);
      }
      if (editingId === record.id) setShowForm(false);
      await load();
      setMessage("Record deleted.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // load repayment history for a record / hide it if already open
  async function showHistory(id) {
    if (historyId === id) {
      setHistoryId(null);
      return;
    }
    setHistoryId(id);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await request(`/${id}/repayments`));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  // main page layout with balances, filters + records
  return (
    <div className="owed-page">
      <header className="owed-header">
        <div>
          <p className="dashboard-eyebrow">FINANCES</p>
          <h1>Money owed</h1>
          <p>Keep track of what friends owe you and what you owe others.</p>
        </div>
        <button type="button" className="owed-back" onClick={onBack}>
          ← Dashboard
        </button>
      </header>
      <div className="owed-summary" aria-label="Outstanding balances">
        <section className="owed-summary-card">
          <p>Owed to you</p>
          <strong>{loading ? "..." : format(totals.owed_to_me)}</strong>
          <span>Still to receive</span>
        </section>
        <section className="owed-summary-card">
          <p>You owe</p>
          <strong>{loading ? "..." : format(totals.i_owe)}</strong>
          <span>Still to repay</span>
        </section>
      </div>
      <div className="owed-ledger-guide">
        <p className="owed-note">
          Keep track of what you're owed and what you need to repay. Once money
          changes hands, record it in Transactions.
        </p>
        <button
          type="button"
          className="owed-ledger-link"
          onClick={onOpenTransactions}
        >
          Open Transactions <span aria-hidden="true">→</span>
        </button>
      </div>
      <section className="owed-panel">
        <div className="owed-panel-heading">
          <div>
            <h2>Your records</h2>
            <p>Manage repayments and track settled balances.</p>
          </div>
          <button type="button" className="owed-primary" onClick={startNew}>
            Add record
          </button>
        </div>
        <div
          className="owed-filter"
          role="group"
          aria-label="Filter money owed records"
        >
          {["outstanding", "settled", "all"].map((value) => (
            <button
              type="button"
              key={value}
              className={filter === value ? "selected" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all"
                ? "All"
                : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        {message && (
          <p className="owed-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="owed-error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="owed-empty">Loading records...</p>
        ) : visible.length === 0 ? (
          <div className="owed-empty">
            <h3>No {filter === "all" ? "" : `${filter} `}records yet</h3>
            <p>Add a personal IOU to start tracking it here.</p>
          </div>
        ) : (
          <div className="owed-records">
            {/* show the filtered records with their balances + actions */}
            {visible.map((record) => {
              const remaining = Number(record.remaining_amount);
              const settled = remaining <= 0;
              return (
                <article className="owed-record" key={record.id}>
                  <div className="owed-record-top">
                    <div>
                      <h3>{record.person}</h3>
                      <p>
                        {record.reason || "No reason added"} ·{" "}
                        {displayDate(record.recorded_on, "long")}
                      </p>
                      <span className="owed-direction">
                        {record.direction === "owed_to_me"
                          ? "Owes you"
                          : "You owe"}
                        {settled ? " · Settled" : ""}
                      </span>
                    </div>
                    <div className="owed-amount">
                      <strong>{format(remaining)}</strong>
                      <span>
                        of {format(record.original_amount)} outstanding
                      </span>
                    </div>
                  </div>
                  <div className="owed-record-actions">
                    {!settled && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setRepaymentId(record.id);
                          setRepaymentAmount("");
                          setRepaymentDate(localISODate());
                          setShowForm(false);
                          setError("");
                        }}
                      >
                        Record repayment
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(record)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => showHistory(record.id)}
                      aria-expanded={historyId === record.id}
                    >
                      {historyId === record.id
                        ? "Hide repayments"
                        : "Repayments"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="owed-delete"
                      onClick={() => remove(record)}
                    >
                      Delete
                    </button>
                  </div>
                  {/* /* form for recording a partial or full repayment */}
                  {repaymentId === record.id && (
                    <form className="owed-inline-form" onSubmit={repay}>
                      <h4>Record a repayment</h4>
                      <p>Remaining balance: {format(remaining)}</p>
                      <label>
                        Amount (£)
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          max={remaining.toFixed(2)}
                          value={repaymentAmount}
                          onChange={(e) => setRepaymentAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          required
                          value={repaymentDate}
                          onChange={(e) => setRepaymentDate(e.target.value)}
                        />
                      </label>
                      <div className="owed-form-actions">
                        <button
                          className="owed-primary"
                          disabled={busy}
                          type="submit"
                        >
                          Save repayment
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepaymentId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {/* show previous repayments for this record */}
                  {historyId === record.id && (
                    <div className="owed-repayment-history">
                      <h4>Repayment history</h4>
                      {historyLoading ? (
                        <p>Loading...</p>
                      ) : history.length ? (
                        <ul>
                          {history.map((item) => (
                            <li key={item.id}>
                              <span>{displayDate(item.paid_on, "long")}</span>
                              <strong>{format(item.amount)}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No repayments recorded yet.</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      {/* form for adding a new record or editing an existing one */}
      {showForm && (
        <div
          ref={editorRef}
          className="owed-editor"
          role="region"
          aria-label={
            editingId ? "Edit money owed record" : "Add money owed record"
          }
        >
          <form className="owed-panel owed-form" onSubmit={save}>
            <div className="owed-panel-heading">
              <div>
                <h2>{editingId ? "Edit record" : "Add record"}</h2>
                <p>Private to your DimeTime account.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close form"
              >
                Close
              </button>
            </div>
            {error && (
              <p className="owed-error" role="alert">
                {error}
              </p>
            )}
            <fieldset>
              <legend>Type</legend>
              <label>
                <input
                  type="radio"
                  name="owed-direction"
                  checked={form.direction === "owed_to_me"}
                  onChange={() =>
                    setForm((old) => ({ ...old, direction: "owed_to_me" }))
                  }
                />{" "}
                Someone owes me
              </label>
              <label>
                <input
                  type="radio"
                  name="owed-direction"
                  checked={form.direction === "i_owe"}
                  onChange={() =>
                    setForm((old) => ({ ...old, direction: "i_owe" }))
                  }
                />{" "}
                I owe someone
              </label>
            </fieldset>
            <div className="owed-form-grid">
              <label>
                Person's name
                <input
                  required
                  maxLength={120}
                  value={form.person}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, person: e.target.value }))
                  }
                  placeholder="e.g. Emma"
                />
              </label>
              <label>
                What for?
                <input
                  maxLength={300}
                  value={form.reason}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, reason: e.target.value }))
                  }
                  placeholder="e.g. Dinner"
                />
              </label>
              <label>
                Amount (£)
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, amount: e.target.value }))
                  }
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  required
                  value={form.recorded_on}
                  onChange={(e) =>
                    setForm((old) => ({ ...old, recorded_on: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="owed-form-actions">
              <button className="owed-primary" type="submit" disabled={busy}>
                {busy ? "Saving..." : editingId ? "Save changes" : "Add record"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
