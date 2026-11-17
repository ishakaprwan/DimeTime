const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const requireAuth = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/errors");

const app = express();

// configure trusted proxy hops for Render without trusting arbitrary IP headers
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 2) {
  throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 2");
}

app.set("trust proxy", proxyHops);

// apply security headers + allow requests from the configured frontend
app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  }),
);

// allow the API to read JSON request bodies
app.use(express.json());

// simple endpoint to check if the API is running
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// public authentication routes for logging in + registering
app.use("/api/auth", require("./routes/auth"));

// routes that require a valid login token
app.use("/api/categories", requireAuth, require("./routes/categories"));
app.use("/api/transactions", requireAuth, require("./routes/transactions"));
app.use("/api/recurring", requireAuth, require("./routes/recurring"));
app.use("/api/planner", requireAuth, require("./routes/planner"));
app.use("/api/student", requireAuth, require("./routes/student"));
app.use("/api/currency", requireAuth, require("./routes/currency"));
app.use("/api/budgets", requireAuth, require("./routes/budgets"));
app.use("/api/money-owed", requireAuth, require("./routes/moneyOwed"));
app.use("/api/assistant", requireAuth, require("./routes/assistant"));

// handle unknown routes + API errors
app.use(notFound);
app.use(errorHandler);

module.exports = app;