require("dotenv").config();

// stop the server from starting if the JWT secret is missing
if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. Copy .env.example to .env first.");
  process.exit(1);
}

// start the API server on the configured port
const app = require("./app");
const port = process.env.PORT || 4000;

app.listen(port, () => console.log(`DimeTime API on http://localhost:${port}`));