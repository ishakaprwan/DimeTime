require("dotenv").config();
const { Pool } = require("pg");

// make sure the Neon connection uses full SSL certificate + hostname verif
// also avoids the pg warning for sslmode=require
const configuredUrl = process.env.DATABASE_URL;
let connectionString = configuredUrl;

if (configuredUrl) {
  const parsed = new URL(configuredUrl);

  const mode = parsed.searchParams.get("sslmode");

  if (mode && ["require", "prefer", "verify-ca"].includes(mode.toLowerCase())) {
    parsed.searchParams.set("sslmode", "verify-full");
    connectionString = parsed.toString();
  }
}

// create the PostgreSQL connection pool
const pool = new Pool({ connectionString });

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};