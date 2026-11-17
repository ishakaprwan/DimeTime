const ALLOWED = new Set([
  "GBP",
  "EUR",
  "USD",
  "INR",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "CHF",
]);
const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();
async function getRate(quote) {
  if (!ALLOWED.has(quote)) {
    const e = new Error("Unsupported currency");
    e.status = 400;
    throw e;
  }
  if (quote === "GBP")
    return {
      base: "GBP",
      quote,
      rate: 1,
      date: new Date().toISOString().slice(0, 10),
    };
  const cached = cache.get(quote);
  if (cached && Date.now() - cached.savedAt < CACHE_MS) return cached.data;
  if (inFlight.has(quote)) return inFlight.get(quote);
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(
        `https://api.frankfurter.dev/v2/rate/GBP/${quote}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!response.ok)
        throw new Error(`Exchange rate provider returned ${response.status}`);
      const data = await response.json();
      if (
        data.base !== "GBP" ||
        data.quote !== quote ||
        !Number.isFinite(data.rate) ||
        data.rate <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.date || "")
      )
        throw new Error("Invalid exchange rate response");
      const result = { base: "GBP", quote, rate: data.rate, date: data.date };
      cache.set(quote, { data: result, savedAt: Date.now() });
      return result;
    } catch (error) {
      if (cached) return { ...cached.data, stale: true };
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();
  inFlight.set(quote, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(quote);
  }
}
module.exports = { getRate, ALLOWED };