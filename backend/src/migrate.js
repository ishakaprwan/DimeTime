const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

// run any database migrations that haven't been applied yet
(async () => {
  // keep track of which migrations have already run
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );

  const dir = path.join(__dirname, "..", "db", "migrations");
  // find all SQL migration files + run them in order
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    // skip migrations that are already recorded in the database
    const done = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE name=$1",
      [file],
    );
    if (done.rowCount) continue;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(dir, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
        file,
      ]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("failed", file, e.message);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  await pool.end();
})();