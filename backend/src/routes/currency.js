const express = require("express");
const { getRate, ALLOWED } = require("../services/currency");

const router = express.Router();

// return the exchange rate for a supported currency
router.get("/rate", async (req, res) => {
  const quote = String(req.query.to || "GBP").toUpperCase();

  if (!ALLOWED.has(quote))
    return res.status(400).json({ error: "Unsupported currency" });

  try {
    res.json(await getRate(quote));
  } catch (error) {
    console.error("Currency provider unavailable:", error.message);
    res
      .status(503)
      .json({
        error: "Exchange rate temporarily unavailable. Amounts remain in GBP.",
      });
  }
});

module.exports = router;