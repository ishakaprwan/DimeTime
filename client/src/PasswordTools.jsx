import { useState } from "react";
import "./PasswordTools.css";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:4000/api"}/auth`;

const strong = (s) =>
  typeof s === "string" &&
  s.length >= 8 &&
  /[A-Z]/.test(s) &&
  /[^A-Za-z0-9\s]/.test(s);

export function ChangePassword({ onChanged }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();

    if (!strong(newPassword)) {
      return setStatus(
        "New password needs at least 8 characters, an uppercase letter and a symbol.",
      );
    }

    if (newPassword !== confirm) {
      return setStatus("New passwords do not match.");
    }

    setStatus("");
    setBusy(true);

    try {
      const response = await fetch(`${API}/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Could not change password.");
      }

      setCurrent("");
      setNext("");
      setConfirm("");
      onChanged();
    } catch (e) {
      setStatus(e.message || "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="dt-password-settings student-panel"
      aria-labelledby="change-password-heading"
    >
      <h3 id="change-password-heading">Change password</h3>

      <p>
        Update your password securely. You will be signed out on all devices
        afterwards.
      </p>

      <form onSubmit={submit} className="dt-password-form">
        <label htmlFor="dt-current-password">Current password</label>
        <input
          id="dt-current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />

        <label htmlFor="dt-new-password">New password</label>
        <input
          id="dt-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNext(e.target.value)}
          minLength={8}
          required
        />

        <label htmlFor="dt-confirm-password">Confirm new password</label>
        <input
          id="dt-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        <p className="dt-password-hint">
          At least 8 characters, one uppercase letter and one symbol. 12 or more
          recommended.
        </p>

        {status && (
          <p className="dt-password-status" role="alert">
            {status}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? "Updating…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

export function PasswordRecovery({ resetToken, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function submit(e) {
    e.preventDefault();

    if (resetToken && !strong(password)) {
      return setStatus(
        "Use at least 8 characters, one uppercase letter and one symbol.",
      );
    }

    if (resetToken && password !== confirm) {
      return setStatus("Passwords do not match.");
    }

    setBusy(true);
    setStatus("");

    try {
      const response = await fetch(
        `${API}/${resetToken ? "reset-password" : "forgot-password"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            resetToken
              ? { token: resetToken, newPassword: password }
              : { email: email.trim() },
          ),
        },
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || "Request failed.");
      }

      setStatus(
        body.message ||
          (resetToken
            ? "Password reset."
            : "If the account exists, a reset link will be sent."),
      );

      setPassword("");
      setConfirm("");
    } catch (e) {
      setStatus(e.message || "Unable to complete request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dt-password-recovery">
      <p>
        {resetToken
          ? "Choose a new password for your account! :D"
          : "Forgot password? Enter your DimeTime account email to request a secure reset link :D"}
      </p>

      <form className="dt-password-form" onSubmit={submit}>
        {resetToken ? (
          <>
            <label htmlFor="dt-reset-password">New password</label>

            <div className="dt-password-input-wrap">
              <input
                id="dt-reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                className="dt-password-visibility"
                aria-label={
                  showPassword ? "Hide new password" : "Show new password"
                }
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            <label htmlFor="dt-reset-confirm">Confirm password</label>

            <div className="dt-password-input-wrap">
              <input
                id="dt-reset-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />

              <button
                type="button"
                className="dt-password-visibility"
                aria-label={
                  showConfirm
                    ? "Hide confirmation password"
                    : "Show confirmation password"
                }
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((value) => !value)}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="dt-reset-email">Email address</label>

            <input
              id="dt-reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </>
        )}

        {status && (
          <p role="status" className="dt-password-status">
            {status}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy
            ? "Please wait…"
            : resetToken
              ? "Reset password"
              : "Send reset link"}
        </button>
      </form>

      <button type="button" className="dt-password-back" onClick={onBack}>
        Back to sign in
      </button>
    </div>
  );
}