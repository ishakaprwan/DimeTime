import { useCurrency } from "../currency";
import { displayDate, localISODate } from "../dateFormat";
import { useCallback, useEffect, useState } from "react";

const API_URL = "http://localhost:4000/api";

// one-off and recurring transactions
function Transactions({ onBack }) {
  const currency = useCurrency();

  const [tab, setTab] = useState("transactions");
  const [transactions, setTransactions] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [categories, setCategories] = useState([]);

  const [historyMonth, setHistoryMonth] = useState("all");
  const [historyKind, setHistoryKind] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historySort, setHistorySort] = useState("newest");

  // one-off transaction form
  const [kind, setKind] = useState("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(localISODate());

  // recurring payment form
  const [recurringKind, setRecurringKind] = useState("expense");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringCategoryId, setRecurringCategoryId] = useState("");
  const [recurringDescription, setRecurringDescription] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [nextDate, setNextDate] = useState(localISODate());

  // custom categories
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryFor, setCategoryFor] = useState("transaction");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeleting, setCategoryDeleting] = useState(false);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const formatMoney = currency.format;
  const formatDate = (value) => displayDate(value, "long");
  const nextRecurringDate = (item) => {
    const original = String(item.next_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(original)) return original;
    if (item.frequency === "termly") return original;

    const [year, month, day] = original.split("-").map(Number);
    let next = new Date(year, month - 1, day, 12);
    const today = localISODate();

    while (localISODate(next) < today) {
      if (item.frequency === "weekly") {
        next.setDate(next.getDate() + 7);
      } else if (item.frequency === "monthly") {
        const nextMonth = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          1,
          12,
        );
        const lastDay = new Date(
          nextMonth.getFullYear(),
          nextMonth.getMonth() + 1,
          0,
        ).getDate();
        nextMonth.setDate(Math.min(next.getDate(), lastDay));
        next = nextMonth;
      } else {
        break;
      }
    }

    return localISODate(next);
  };

  // load the latest records
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [transactionResponse, categoryResponse, recurringResponse] =
        await Promise.all([
          fetch(`${API_URL}/transactions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/categories`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/recurring`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

      if (
        !transactionResponse.ok ||
        !categoryResponse.ok ||
        !recurringResponse.ok
      ) {
        throw new Error("Could not load your transactions.");
      }

      const transactionData = await transactionResponse.json();
      const categoryData = await categoryResponse.json();
      const recurringData = await recurringResponse.json();

      setTransactions(transactionData);
      setCategories(categoryData);
      setRecurring(recurringData);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    Promise.resolve().then(() => loadData());
  }, [loadData]);

  const filteredCategories = categories.filter(
    (category) => category.kind === kind,
  );

  const recurringCategories = categories.filter(
    (category) => category.kind === recurringKind,
  );

  const categoryType = categoryFor === "recurring" ? recurringKind : kind;

  const currentYear = Number(localISODate().slice(0, 4));
  const transactionYears = transactions
    .map((item) => String(item.occurred_on || item.date || "").slice(0, 4))
    .filter((year) => /^\d{4}$/.test(year))
    .map(Number);

  const firstYear = Math.min(currentYear, ...transactionYears);
  const lastYear = Math.max(currentYear, ...transactionYears);
  const historyYears = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => lastYear - index,
  );

  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat("en-GB", { month: "long" }).format(
      new Date(Date.UTC(2020, index, 1)),
    ),
  );

  const visibleTransactions = transactions
    .filter((item) => {
      const date = String(item.occurred_on || item.date || "").slice(0, 10);
      const status = item.status || "completed";

      return (
        (historyMonth === "all" || date.startsWith(historyMonth)) &&
        (historyKind === "all" || item.kind === historyKind) &&
        (historyStatus === "all" || status === historyStatus)
      );
    })
    .sort((a, b) => {
      const aDate = String(a.occurred_on || a.date || "").slice(0, 10);
      const bDate = String(b.occurred_on || b.date || "").slice(0, 10);
      const aAmount = Number(a.amount) || 0;
      const bAmount = Number(b.amount) || 0;

      if (historySort === "oldest")
        return aDate.localeCompare(bDate) || Number(a.id) - Number(b.id);
      if (historySort === "highest")
        return bAmount - aAmount || bDate.localeCompare(aDate);
      if (historySort === "lowest")
        return aAmount - bAmount || bDate.localeCompare(aDate);
      return bDate.localeCompare(aDate) || Number(b.id) - Number(a.id);
    });

  const openCategoryForm = (location) => {
    setCategoryFor(location);
    setNewCategoryName("");
    setMessage("");
    setShowCategoryForm(true);
  };

  const closeCategoryForm = () => {
    setShowCategoryForm(false);
    setNewCategoryName("");
  };

  const addCategory = async (event) => {
    event.preventDefault();

    const name = newCategoryName.trim();

    if (!name) {
      setMessage("Please enter a category name.");
      return;
    }

    try {
      setCategorySaving(true);
      setMessage("");

      const response = await fetch(`${API_URL}/categories`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          kind: categoryType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not create category.");
      }

      await loadData();

      // select the category that was just added
      if (categoryFor === "recurring") {
        setRecurringCategoryId(String(data.id));
      } else {
        setCategoryId(String(data.id));
      }

      setNewCategoryName("");
      setShowCategoryForm(false);
      setMessage(`"${name}" category added!`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCategorySaving(false);
    }
  };

  const deleteSelectedCategory = async (location) => {
    const selectedId =
      location === "recurring" ? recurringCategoryId : categoryId;
    const selectedCategory = categories.find(
      (category) => String(category.id) === String(selectedId),
    );

    if (!selectedCategory || categoryDeleting) return;

    const confirmed = window.confirm(
      `Delete the ${selectedCategory.kind} category "${selectedCategory.name}"? ` +
        "This cannot be undone. If the category is used by existing records, deletion may be prevented.",
    );
    if (!confirmed) return;

    try {
      setCategoryDeleting(true);
      setMessage("");

      const response = await fetch(
        `${API_URL}/categories/${selectedCategory.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error ||
            "Could not delete this category. It may be in use by an existing transaction or recurring payment.",
        );
      }

      if (String(categoryId) === String(selectedCategory.id)) setCategoryId("");
      if (String(recurringCategoryId) === String(selectedCategory.id))
        setRecurringCategoryId("");

      await loadData();
      setMessage(`"${selectedCategory.name}" category deleted.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCategoryDeleting(false);
    }
  };

  const addTransaction = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!amount) {
      setMessage("Please enter an amount.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/transactions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind,
          amount: Number(amount),
          category_id: categoryId ? Number(categoryId) : null,
          description,
          occurred_on: date,
          // future payments stay scheduled until completed
          status: date > localISODate() ? "scheduled" : "completed",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not add transaction.");
      }

      setAmount("");
      setDescription("");
      setCategoryId("");
      setDate(localISODate());

      setMessage(
        date > localISODate()
          ? "One-off payment scheduled and included in your forecast."
          : "Transaction added!",
      );

      await loadData();
      window.dispatchEvent(new Event("dimetime-finances-updated"));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const completeScheduledTransaction = async (id) => {
    try {
      const response = await fetch(`${API_URL}/transactions/${id}/complete`, {
        method: "PATCH",
        headers,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not complete this payment.");
      }

      setMessage("Payment recorded as completed.");

      await loadData();
      window.dispatchEvent(new Event("dimetime-finances-updated"));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteTransaction = async (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this transaction?",
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/transactions/${id}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        throw new Error("Could not delete transaction.");
      }

      setMessage("Transaction deleted.");

      await loadData();
      window.dispatchEvent(new Event("dimetime-finances-updated"));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const addRecurring = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!recurringAmount) {
      setMessage("Please enter an amount.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/recurring`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: recurringKind,
          amount: Number(recurringAmount),
          category_id: recurringCategoryId ? Number(recurringCategoryId) : null,
          description: recurringDescription,
          frequency,
          next_date: nextDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not create recurring transaction.",
        );
      }

      setRecurringAmount("");
      setRecurringDescription("");
      setRecurringCategoryId("");
      setMessage("Recurring transaction added!");

      await loadData();
      window.dispatchEvent(new Event("dimetime-finances-updated"));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const toggleRecurring = async (item) => {
    try {
      const response = await fetch(`${API_URL}/recurring/${item.id}/active`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          active: !item.active,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Could not update recurring transaction.",
        );
      }

      setMessage(
        item.active
          ? "Recurring transaction stopped."
          : "Recurring transaction restarted.",
      );

      await loadData();
      window.dispatchEvent(new Event("dimetime-finances-updated"));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteRecurring = async (id) => {
    const confirmed = window.confirm(
      "Delete this recurring transaction permanently?",
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/recurring/${id}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        throw new Error("Could not delete recurring transaction.");
      }

      setMessage("Recurring transaction deleted.");

      await loadData();
      window.dispatchEvent(new Event("dimetime-finances-updated"));
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="transactions-page">
      {showCategoryForm && (
        <div
          className="category-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCategoryForm();
            }
          }}
        >
          <form className="category-modal" onSubmit={addCategory}>
            <div className="category-modal-top">
              <div>
                <p className="dashboard-eyebrow">NEW CATEGORY</p>
                <h2>Add category</h2>
              </div>

              <button
                type="button"
                className="category-close-button"
                onClick={closeCategoryForm}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p className="category-modal-description">
              Create a new <strong>{categoryType}</strong> category.
            </p>

            <label className="field">
              <span>Category name</span>
              <input
                type="text"
                placeholder={
                  categoryType === "income" ? "e.g. Tutoring" : "e.g. Gym"
                }
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                autoFocus
              />
            </label>

            <div className="category-modal-actions">
              <button
                type="button"
                className="secondary-small"
                onClick={closeCategoryForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-small"
                disabled={categorySaving}
              >
                {categorySaving ? "Adding..." : "Add category"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="budget-topbar transactions-topbar">
        <div>
          <p className="dashboard-eyebrow">MONEY</p>
          <h1>Transactions</h1>
          <p>Track money you've received, spent, and payments that repeat.</p>
        </div>

        <button type="button" className="back-button" onClick={onBack}>
          ← Dashboard
        </button>
      </div>

      <div className="transaction-tabs">
        <button
          className={`transaction-tab ${
            tab === "transactions" ? "active" : ""
          }`}
          onClick={() => {
            setTab("transactions");
            setMessage("");
          }}
        >
          One-off
        </button>

        <button
          className={`transaction-tab ${tab === "recurring" ? "active" : ""}`}
          onClick={() => {
            setTab("recurring");
            setMessage("");
          }}
        >
          Recurring
        </button>
      </div>

      {message && <div className="transaction-message">{message}</div>}

      {tab === "transactions" && (
        <div className="transactions-layout">
          <form className="transaction-form-card" onSubmit={addTransaction}>
            <h2>Add transaction</h2>
            <p className="transaction-form-help">
              Record money you've spent or received.
            </p>

            <div className="transaction-type">
              <button
                type="button"
                className={`type-button ${kind === "expense" ? "active" : ""}`}
                onClick={() => {
                  setKind("expense");
                  setCategoryId("");
                }}
              >
                Expense
              </button>

              <button
                type="button"
                className={`type-button ${kind === "income" ? "active" : ""}`}
                onClick={() => {
                  setKind("income");
                  setCategoryId("");
                }}
              >
                Income
              </button>
            </div>

            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>

            <div className="transaction-category-field">
              <label className="field">
                <span>Category</span>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">No category</option>

                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="add-category-button"
                onClick={() => openCategoryForm("transaction")}
              >
                + Add new {kind} category
              </button>
              <button
                type="button"
                className="add-category-button delete-category-button"
                onClick={() => deleteSelectedCategory("transaction")}
                disabled={!categoryId || categoryDeleting}
              >
                {categoryDeleting
                  ? "Deleting category..."
                  : `Delete selected ${kind} category`}
              </button>
            </div>

            <label className="field">
              <span>Description</span>
              <input
                type="text"
                placeholder="e.g. Weekly food shop"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>

            <p
              className="student-muted"
              style={{ margin: "0 0 12px", fontSize: "0.85rem" }}
            >
              {date > localISODate()
                ? "Scheduled one-off: this payment will appear in your forecast until completed."
                : "Completed transaction: this payment will update your recorded balance."}
            </p>

            <button className="primary-small" type="submit">
              {date > localISODate() ? "Schedule payment" : "Add transaction"}
            </button>
          </form>

          <div className="transaction-history-card">
            <div className="transaction-history-header">
              <div>
                <h2>Transaction history</h2>
                <p>Your recorded income and expenses.</p>
              </div>
              <div className="transaction-history-filters">
                <select
                  aria-label="Filter transactions by month"
                  value={historyMonth}
                  onChange={(event) => setHistoryMonth(event.target.value)}
                >
                  <option value="all">All months</option>
                  {historyYears.map((year) => (
                    <optgroup key={year} label={String(year)}>
                      {monthNames.map((monthName, index) => (
                        <option
                          key={`${year}-${index}`}
                          value={`${year}-${String(index + 1).padStart(2, "0")}`}
                        >
                          {monthName} {year}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <select
                  aria-label="Filter transactions by type"
                  value={historyKind}
                  onChange={(event) => setHistoryKind(event.target.value)}
                >
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expenses</option>
                </select>
                <select
                  aria-label="Filter transactions by status"
                  value={historyStatus}
                  onChange={(event) => setHistoryStatus(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="scheduled">Scheduled</option>
                </select>
                <select
                  aria-label="Sort transactions"
                  value={historySort}
                  onChange={(event) => setHistorySort(event.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="highest">Highest amount</option>
                  <option value="lowest">Lowest amount</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className="transaction-empty">Loading...</p>
            ) : transactions.length === 0 ? (
              <p className="transaction-empty">
                You haven't added any transactions yet.
              </p>
            ) : visibleTransactions.length === 0 ? (
              <div className="transaction-empty">
                <p>
                  {historyMonth !== "all" &&
                  historyKind === "all" &&
                  historyStatus === "all"
                    ? `No transactions recorded for ${monthNames[Number(historyMonth.slice(5)) - 1]} ${historyMonth.slice(0, 4)}.`
                    : "No transactions match these filters."}
                </p>
                <button
                  type="button"
                  className="transaction-clear-filters"
                  onClick={() => {
                    setHistoryMonth("all");
                    setHistoryKind("all");
                    setHistoryStatus("all");
                    setHistorySort("newest");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="transaction-list">
                {visibleTransactions.map((transaction) => (
                  <div className="transaction-row" key={transaction.id}>
                    <div className="transaction-row-left">
                      <div className={`transaction-symbol ${transaction.kind}`}>
                        {transaction.kind === "income" ? "+" : "−"}
                      </div>

                      <div>
                        <strong>
                          {transaction.description ||
                            transaction.category ||
                            (transaction.kind === "income"
                              ? "Income"
                              : "Expense")}
                        </strong>

                        {transaction.status === "scheduled" && (
                          <span
                            style={{
                              display: "inline-block",
                              marginLeft: 8,
                              fontSize: "0.76rem",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            (Scheduled)
                          </span>
                        )}

                        <p>
                          {transaction.category || "No category"}
                          {" • "}
                          {formatDate(
                            transaction.occurred_on || transaction.date,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="transaction-row-right">
                      <strong
                        className={
                          transaction.kind === "income"
                            ? "money-income"
                            : "money-expense"
                        }
                      >
                        {transaction.kind === "income" ? "+" : "−"}
                        {formatMoney(transaction.amount)}
                      </strong>

                      {transaction.status === "scheduled" && (
                        <button
                          type="button"
                          className="primary-small"
                          onClick={() =>
                            completeScheduledTransaction(transaction.id)
                          }
                        >
                          Mark completed
                        </button>
                      )}

                      <button
                        className="delete-transaction"
                        onClick={() => deleteTransaction(transaction.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "recurring" && (
        <div className="transactions-layout">
          <form className="transaction-form-card" onSubmit={addRecurring}>
            <h2>Add recurring payment</h2>
            <p className="recurring-form-help">
              Add money you regularly receive or pay.
            </p>

            <div className="transaction-type">
              <button
                type="button"
                className={`type-button ${
                  recurringKind === "expense" ? "active" : ""
                }`}
                onClick={() => {
                  setRecurringKind("expense");
                  setRecurringCategoryId("");
                }}
              >
                Expense
              </button>

              <button
                type="button"
                className={`type-button ${
                  recurringKind === "income" ? "active" : ""
                }`}
                onClick={() => {
                  setRecurringKind("income");
                  setRecurringCategoryId("");
                }}
              >
                Income
              </button>
            </div>

            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={recurringAmount}
                onChange={(event) => setRecurringAmount(event.target.value)}
              />
            </label>

            <div className="transaction-category-field">
              <label className="field">
                <span>Category</span>
                <select
                  value={recurringCategoryId}
                  onChange={(event) =>
                    setRecurringCategoryId(event.target.value)
                  }
                >
                  <option value="">No category</option>

                  {recurringCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="add-category-button"
                onClick={() => openCategoryForm("recurring")}
              >
                + Add new {recurringKind} category
              </button>
              <button
                type="button"
                className="add-category-button delete-category-button"
                onClick={() => deleteSelectedCategory("recurring")}
                disabled={!recurringCategoryId || categoryDeleting}
              >
                {categoryDeleting
                  ? "Deleting category..."
                  : `Delete selected ${recurringKind} category`}
              </button>
            </div>

            <label className="field">
              <span>Name / description</span>
              <input
                type="text"
                placeholder={
                  recurringKind === "income"
                    ? "e.g. Part-time job"
                    : "e.g. Rent"
                }
                value={recurringDescription}
                onChange={(event) =>
                  setRecurringDescription(event.target.value)
                }
              />
            </label>

            <label className="field">
              <span>Repeats</span>
              <select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="termly">Termly</option>
              </select>
            </label>

            <label className="field">
              <span>Next payment date</span>
              <input
                type="date"
                value={nextDate}
                onChange={(event) => setNextDate(event.target.value)}
              />
            </label>

            <button className="primary-small" type="submit">
              Add recurring
            </button>
          </form>

          <div className="transaction-history-card">
            <div className="transaction-history-header">
              <div>
                <h2>Recurring payments</h2>
                <p>Your regular income and expenses.</p>
              </div>
            </div>

            {loading ? (
              <p className="transaction-empty">Loading...</p>
            ) : recurring.length === 0 ? (
              <div className="transaction-empty">
                <p>You don't have any recurring payments yet.</p>
              </div>
            ) : (
              <div className="transaction-list">
                {recurring.map((item) => (
                  <div
                    className={`transaction-row recurring-row ${
                      !item.active ? "recurring-inactive" : ""
                    }`}
                    key={item.id}
                  >
                    <div className="transaction-row-left">
                      <div className={`transaction-symbol ${item.kind}`}>
                        {item.kind === "income" ? "+" : "−"}
                      </div>

                      <div>
                        <div className="recurring-title-line">
                          <strong>
                            {item.description ||
                              item.category ||
                              (item.kind === "income"
                                ? "Recurring income"
                                : "Recurring expense")}
                          </strong>

                          {!item.active && (
                            <span className="stopped-badge">Stopped</span>
                          )}
                        </div>

                        <p>
                          {item.category || "No category"}
                          {" • "}
                          {item.frequency.charAt(0).toUpperCase() +
                            item.frequency.slice(1)}
                        </p>

                        <p>
                          {item.active
                            ? `${item.frequency === "termly" && String(item.next_date).slice(0, 10) < localISODate() ? "Past date" : "Next"}: ${formatDate(nextRecurringDate(item))}`
                            : "No future payments"}
                        </p>
                      </div>
                    </div>

                    <div className="transaction-row-right">
                      <strong
                        className={
                          item.kind === "income"
                            ? "money-income"
                            : "money-expense"
                        }
                      >
                        {item.kind === "income" ? "+" : "−"}
                        {formatMoney(item.amount)}
                      </strong>

                      <div className="recurring-actions">
                        <button
                          className="secondary-small"
                          onClick={() => toggleRecurring(item)}
                        >
                          {item.active ? "Stop recurring" : "Restart"}
                        </button>

                        <button
                          className="delete-transaction"
                          onClick={() => deleteRecurring(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Transactions;