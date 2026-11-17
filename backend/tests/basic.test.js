const request = require("supertest");
const app = require("../src/app");
const { pool } = require("../src/db");

afterAll(async () => {
  await pool.end();
});

describe("API basics", () => {
  // check the API is running + responding properly
  test("health check", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // make sure protected routes can't be accessed without logging in
  test("protected routes reject missing token", async () => {
    for (const p of ["/api/transactions", "/api/categories"]) {
      const res = await request(app).get(p);
      expect(res.status).toBe(401);
    }
  });

  test("register validates input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "nope", password: "short" });
    expect(res.status).toBe(400);
  });
});