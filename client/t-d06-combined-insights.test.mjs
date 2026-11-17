import assert from "node:assert/strict";
import {
  buildCombinedInsights,
  combinedInsightWeeks,
} from "./src/combinedInsights.js";

const todayISO = "2026-11-13";

const a = (date, status = "not started") => ({ due: date, status });
const expense = (date, amount) => ({ date, kind: "expense", amount });
const income = (date, amount) => ({ date, kind: "income", amount });

const build = (assessments = [], upcoming = []) =>
  buildCombinedInsights({
    todayISO,
    assessments,
    upcoming,
    formatMoney: (value) => `£${value.toFixed(2)}`,
  });

const tests = [
  [
    "Current week starts Monday and ends Sunday",
    () => {
      assert.deepEqual(combinedInsightWeeks(todayISO)[0], {
        start: "2026-11-09",
        end: "2026-11-15",
      });
    },
  ],

  [
    "Four-week window ends 6 December",
    () => {
      const weeks = combinedInsightWeeks(todayISO);
      assert.equal(weeks.length, 4);
      assert.deepEqual(weeks[3], { start: "2026-11-30", end: "2026-12-06" });
    },
  ],

  [
    "Two unfinished assessments plus an expense creates an insight",
    () => {
      const out = build(
        [a("2026-11-24"), a("2026-11-26", "in progress")],
        [expense("2026-11-25", 17.25)],
      );
      assert.equal(out.length, 1);
      assert.match(out[0].detail, /2 assessment deadlines/);
    },
  ],

  [
    "A single unfinished assessment is insufficient",
    () => {
      assert.equal(
        build([a("2026-11-24")], [expense("2026-11-25", 17.25)]).length,
        0,
      );
    },
  ],

  [
    "Two deadlines without scheduled expenses give no insight",
    () => {
      assert.equal(build([a("2026-11-24"), a("2026-11-26")], []).length, 0);
    },
  ],

  [
    "Completed assessments do not count",
    () => {
      assert.equal(
        build(
          [a("2026-11-24", "completed"), a("2026-11-26")],
          [expense("2026-11-25", 17.25)],
        ).length,
        0,
      );
    },
  ],

  [
    "Scheduled income does not count as expense",
    () => {
      assert.equal(
        build([a("2026-11-24"), a("2026-11-26")], [income("2026-11-25", 30)])
          .length,
        0,
      );
    },
  ],

  [
    "Sunday and Monday are grouped into separate weeks",
    () => {
      const out = build(
        [a("2026-11-20"), a("2026-11-22"), a("2026-11-23"), a("2026-11-27")],
        [expense("2026-11-22", 13.37), expense("2026-11-23", 24.68)],
      );

      assert.equal(out.length, 2);
      assert.equal(out[0].key, "combined-week-2026-11-16");
      assert.equal(out[1].key, "combined-week-2026-11-23");
      assert.match(out[0].detail, /£13\.37/);
      assert.match(out[1].detail, /£24\.68/);
    },
  ],

  [
    "A fifth week is excluded even if its trigger conditions are met",
    () => {
      assert.equal(
        build([a("2026-12-07"), a("2026-12-08")], [expense("2026-12-07", 8.17)])
          .length,
        0,
      );
    },
  ],

  [
    "Scheduled expenses are added for their own week",
    () => {
      const out = build(
        [a("2026-11-24"), a("2026-11-26")],
        [
          expense("2026-11-23", 100),
          expense("2026-11-25", 17.25),
          expense("2026-12-01", 22),
        ],
      );

      assert.equal(out.length, 1);
      assert.match(out[0].detail, /£117\.25/);
    },
  ],

  [
    "Valid alternative deadline field names are recognised",
    () => {
      const out = build(
        [
          { due_date: "2026-11-24", status: "not started" },
          { deadline: "2026-11-26", status: "in progress" },
        ],
        [expense("2026-11-25", 10)],
      );

      assert.equal(out.length, 1);
      assert.match(out[0].detail, /2 assessment deadlines/);
    },
  ],
];

let failures = 0;

for (const [i, [name, test]] of tests.entries()) {
  try {
    test();
    console.log(`PASS ${String(i + 1).padStart(2, "0")}/11 - ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${String(i + 1).padStart(2, "0")}/11 - ${name}`);
    console.error(error);
  }
}

console.log(
  `\nT-D06 RESULT: ${tests.length - failures}/11 passed, ${failures} failed`,
);

if (failures) process.exitCode = 1;