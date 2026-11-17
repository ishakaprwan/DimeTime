import { useCurrency } from "../currency";
import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// budget page for setting monthly limits + spending; spendng against each category
function Budget({ onBack }) {
  const currency = useCurrency();
  const money = currency.format;

  const [categories, setCategories] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [limit, setLimit] = useState("");
  const [message, setMessage] = useState("");

  const token = localStorage.getItem("token");

  // using the current month as a reference for viewwing + editing budgets; past months are read-only
  const currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  // generate months options for reviewing past / future budgets
  const monthChoices = useMemo(() => {
    const now = new Date();

    return Array.from({ length: 61 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 48 + index, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return {
        value,
        label: date.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        }),
      };
    }).reverse();
  }, []);

  // past months are read-only
  const isPastMonth = selectedMonth < currentMonth;
  const monthTitle = new Date(
    `${selectedMonth}-01T12:00:00`,
  ).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  // to fetch the budget data for the selected month from the API; show error if fail
  const loadBudget = useCallback(async () => {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch(
        `${API_URL}/budgets/monthly?month=${encodeURIComponent(selectedMonth)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Could not load your budget.");
        return;
      }

      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch (error) {
      console.error("Could not load budget:", error);
      setMessage("Could not connect to the DimeTime API.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, token]);

  useEffect(() => {
    Promise.resolve().then(() => loadBudget());
  }, [loadBudget]);

  // calculate total spending, allocated budget + budgeted categories for the selected month
  const totals = useMemo(
    () =>
      categories.reduce(
        // keeping existing reducer here
        (result, category) => {
          const spent = Number(category.spent || 0);
          const hasLimit =
            category.budget_limit !== null &&
            category.budget_limit !== undefined;
          result.spent += spent;
          if (hasLimit) {
            result.allocated += Number(category.budget_limit || 0);
            result.budgetedSpent = (result.budgetedSpent || 0) + spent;
            result.budgetedCount += 1;
          }
          return result;
        },
        { spent: 0, allocated: 0, budgetedCount: 0, budgetedSpent: 0 },
      ),
    [categories],
  );

  const overallRemaining = totals.allocated - totals.budgetedSpent;

  // calculate total unused budget + overspending for all categories for the selected month
  const categoryTotals = useMemo(
    () =>
      categories.reduce(
        (acc, category) => {
          // keeping existing reducer here
          if (
            category.budget_limit === null ||
            category.budget_limit === undefined
          )
            return acc;
          const difference =
            Number(category.budget_limit) - Number(category.spent || 0);
          if (difference >= 0) acc.unused += difference;
          else {
            acc.over += Math.abs(difference);
            acc.overCount += 1;
          }
          return acc;
        },
        { unused: 0, over: 0, overCount: 0 },
      ),
    [categories],
  );

  const hasAnyBudget = totals.budgetedCount > 0;

  // handle editing a category's budget limit; prevent editing for past months
  function beginEdit(category) {
    setEditingId(category.id);
    if (isPastMonth) return;

    setLimit(
      category.budget_limit == null ? "" : String(category.budget_limit),
    );
    setMessage("");
  }

  // clear the current edit without saving any changes
  function cancelEdit() {
    setEditingId(null);
    setLimit("");
    setMessage("");
  }

  // check the entered limit -> send a PUT request to the API to save the new limit for the category; show error if fail
  async function saveLimit(category) {
    if (isPastMonth) return;
    const numericLimit = limit.trim() === "" ? null : Number(limit);
    if (
      numericLimit !== null &&
      (!Number.isFinite(numericLimit) || numericLimit < 0)
    ) {
      setMessage("Budget limit must be GBP 0 or more.");
      return;
    }
    try {
      setSavingId(category.id);
      setMessage("");
      const response = await fetch(
        `${API_URL}/budgets/${category.id}?month=${encodeURIComponent(selectedMonth)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            budget_limit: numericLimit,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not update this budget.");
        return;
      }
      setEditingId(null);
      setLimit("");
      await loadBudget();
    } catch (error) {
      console.error("Could not update budget:", error);
      setMessage("Could not connect to the DimeTime API.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="budget-page budget-editorial">
      <div className="budget-topbar">
        <div>
          <p className="dashboard-eyebrow">MONEY</p>
          <h1>Budget</h1>
          <p>Set simple monthly limits and see how your spending is going.</p>
        </div>
        <button className="back-button" onClick={onBack}>
          ← Dashboard
        </button>
      </div>

      <div className="budget-month-picker">
        <label htmlFor="budget-month-select">Review month</label>
        <div className="budget-month-picker-controls">
          <select
            id="budget-month-select"
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(event.target.value);
              setEditingId(null);
              setMessage("");
            }}
            aria-label="Choose month to review budget"
          >
            {monthChoices.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          {selectedMonth !== currentMonth && (
            <button
              type="button"
              className="budget-month-today"
              onClick={() => {
                setSelectedMonth(currentMonth);
                setEditingId(null);
                setMessage("");
              }}
            >
              This month
            </button>
          )}
        </div>
      </div>
      {isPastMonth && (
        <p className="budget-history-notice">
          Past months show completed spending and the limits saved for that
          period. A missing limit means it was not recorded, not that the limit
          was zero.
        </p>
      )}
      {message && <p className="message">{message}</p>}

      <section className="budget-summary-grid">
        <div className="summary-card">
          <p>Monthly limits</p>
          <h2>{loading ? "..." : money(totals.allocated)}</h2>
          <span>
            Across {totals.budgetedCount}{" "}
            {totals.budgetedCount === 1 ? "category" : "categories"}
          </span>
        </div>
        <div className="summary-card">
          <p>Spent</p>
          <h2>{loading ? "..." : money(totals.spent)}</h2>
          <span>{monthTitle}</span>
        </div>
        <div className="summary-card budget-summary-highlight">
          <p>
            {overallRemaining >= 0
              ? "Net budget difference"
              : "Net over budget"}
          </p>
          <h2>
            {loading
              ? "..."
              : hasAnyBudget
                ? money(Math.abs(overallRemaining))
                : "Not set"}
          </h2>
          <span>
            {totals.budgetedCount === 0
              ? "No saved limits for this month"
              : "Total limits minus spending in budgeted categories"}
          </span>
        </div>
      </section>
      {!loading && hasAnyBudget && categoryTotals.overCount > 0 && (
        <p className="budget-net-explainer" role="status">
          <strong>{money(categoryTotals.over)} over budget</strong> across{" "}
          {categoryTotals.overCount}{" "}
          {categoryTotals.overCount === 1 ? "category" : "categories"}. The net
          difference accounts for both unused limits and overspending. It is not
          a safe-to-spend amount.
        </p>
      )}

      <section className="budget-card">
        <div className="card-heading">
          <div>
            <h3>Monthly category limits</h3>
            <p>
              {isPastMonth
                ? "Review recorded spending and saved limits from this month."
                : "Set monthly limits and review recorded spending for the selected month."}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state small">
            <p>Loading your budget...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">£</div>
            <h4>No expense categories yet</h4>
            <p>Add an expense category from Transactions first.</p>
          </div>
        ) : (
          <div className="budget-list">
            {categories.map((category) => {
              // calculate spent + limit + percentage used + remaining budget for each category
              const spent = Number(category.spent || 0);
              const hasLimit =
                category.budget_limit !== null &&
                category.budget_limit !== undefined;

              // existing calculations continue here
              const categoryLimit = hasLimit
                ? Number(category.budget_limit || 0)
                : 0;
              const percentage =
                hasLimit && categoryLimit > 0
                  ? Math.round((spent / categoryLimit) * 100)
                  : 0;
              const remaining = categoryLimit - spent;

              return (
                <div className="budget-row" key={category.id}>
                  <div className="budget-row-top">
                    <div>
                      <strong>{category.name}</strong>
                      {hasLimit ? (
                        <p>
                          {money(spent)} of {money(categoryLimit)}
                        </p>
                      ) : (
                        <p>
                          {money(spent)} spent ·{" "}
                          {isPastMonth
                            ? "no historical limit saved"
                            : "no limit set"}
                        </p>
                      )}
                    </div>
                    {!isPastMonth && editingId !== category.id && (
                      <button
                        type="button"
                        className="budget-edit-button"
                        onClick={() => beginEdit(category)}
                      >
                        {hasLimit ? "Edit limit" : "Set limit"}
                      </button>
                    )}
                  </div>

                  {hasLimit && (
                    <>
                      <div
                        className="budget-progress"
                        role="progressbar"
                        aria-label={`${category.name} budget used`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.min(100, Math.max(0, percentage))}
                        aria-valuetext={`${percentage}% of budget used`}
                      >
                        <div
                          className={`budget-progress-fill ${percentage >= 100 ? "over" : percentage >= 80 ? "warning" : ""}`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      <div className="budget-progress-info">
                        <span>{percentage}% used</span>
                        <span
                          className={remaining < 0 ? "budget-over-text" : ""}
                        >
                          {remaining >= 0
                            ? `${money(remaining)} remaining`
                            : `${money(Math.abs(remaining))} over budget`}
                        </span>
                      </div>
                    </>
                  )}

                  {editingId === category.id && (
                    <div className="budget-edit-panel">
                      <label htmlFor={`budget-${category.id}`}>
                        Monthly limit
                      </label>
                      <div className="budget-edit-controls">
                        <div className="budget-money-input">
                          <span>£ (GBP)</span>
                          <input
                            id={`budget-${category.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={limit}
                            onChange={(event) => setLimit(event.target.value)}
                            autoFocus
                          />
                        </div>
                        <button
                          type="button"
                          className="primary-small"
                          disabled={savingId === category.id}
                          onClick={() => saveLimit(category)}
                        >
                          {savingId === category.id ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="secondary-small"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="budget-edit-help">
                        Leave the box empty and save to remove the limit.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Budget;