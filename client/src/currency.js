import { useEffect, useState } from "react";
import { getStudentSnapshot, subscribeStudent } from "./studentStore";

export const CURRENCIES = [
  ["GBP", "British pound"],
  ["EUR", "Euro"],
  ["USD", "US dollar"],
  ["INR", "Indian rupee"],
  ["CAD", "Canadian dollar"],
  ["AUD", "Australian dollar"],
  ["NZD", "New Zealand dollar"],
  ["JPY", "Japanese yen"],
  ["CHF", "Swiss franc"],
];

const SUPPORTED = new Set(CURRENCIES.map(([code]) => code));
const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const currencyCode = (value) => (SUPPORTED.has(value) ? value : "GBP");

const pounds = (number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(number || 0));

export function useCurrency() {
  const getPreferred = () => {
    let user;

    try {
      user = JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      user = null;
    }

    return currencyCode(getStudentSnapshot(user?.id)?.displayCurrency);
  };

  const [preferred, setPreferred] = useState(getPreferred);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeStudent(() => setPreferred(getPreferred())), []);

  useEffect(() => {
    let active = true;

    // GBP is the base currency; so no exchange rate is needed
    if (preferred === "GBP") {
      Promise.resolve().then(() => {
        if (!active) return;

        setRate({ rate: 1, date: null, quote: "GBP" });
        setLoading(false);
        setError("");
      });

      return () => {
        active = false;
      };
    }

    Promise.resolve().then(() => {
      if (!active) return;

      setRate(null);
      setLoading(true);
      setError("");
    });

    fetch(`${API}/currency/rate?to=${encodeURIComponent(preferred)}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Exchange rate unavailable");
        }

        return response.json();
      })
      .then((data) => {
        if (
          active &&
          data.quote === preferred &&
          Number.isFinite(data.rate) &&
          data.rate > 0
        ) {
          setRate(data);
          setError("");
        } else if (active) {
          throw new Error("Invalid exchange rate");
        }
      })
      .catch(() => {
        if (active) {
          setRate(null);
          setError("Exchange rate unavailable. Figures shown in GBP.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    // ignore responses from previous currency requests
    return () => {
      active = false;
    };
  }, [preferred]);

  const activeCurrency = preferred === "GBP" || !rate ? "GBP" : preferred;
  const multiplier = activeCurrency === "GBP" ? 1 : rate.rate;

  const format = (amount) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: activeCurrency,
    }).format(Number(amount || 0) * multiplier);

  return {
    preferred,
    activeCurrency,
    rate,
    loading,
    error,
    format,
    pounds,
    multiplier,
    note:
      activeCurrency === "GBP"
        ? error || "Amounts are recorded in GBP."
        : `Converted from GBP using the ${rate.date} reference rate (1 GBP = ${rate.rate} ${activeCurrency})${rate.stale ? ". Last available rate." : "."}`,
  };
}