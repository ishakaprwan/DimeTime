import { useEffect, useRef, useState } from "react";

const steps = [
  {
    title: "Academic calendar",
    destination: "settings",
    action: "Open Student settings",
    description:
      "Set up your academic year and term dates in Student settings to keep your schedule organised.",
  },
  {
    title: "Modules and assessments",
    destination: "academics",
    action: "Open Academics",
    description:
      "Add your modules and assessment deadlines to keep track of your workload.",
  },
  {
    title: "Planner",
    destination: "planner",
    action: "Open Planner",
    description:
      "Organise lectures, shifts and personal events, including anything that repeats.",
  },
  {
    title: "Money",
    destination: "transactions",
    action: "Open Transactions",
    description:
      "Record income and expenses in Transactions, then explore your forecast and budgets.",
  },
];

export default function SetupGuide({ onFinish, onNavigate }) {
  const [index, setIndex] = useState(0);
  const [compact, setCompact] = useState(false);
  const [visited, setVisited] = useState({});

  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const compactRef = useRef(null);

  useEffect(() => {
    if (compact) return undefined;

    const previous = document.activeElement;

    closeRef.current?.focus();

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onFinish();
        return;
      }

      if (event.key !== "Tab") return;

      const buttons = [
        ...(dialogRef.current?.querySelectorAll("button:not(:disabled)") || []),
      ];

      if (!buttons.length) return;

      const first = buttons[0];
      const last = buttons[buttons.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [compact, onFinish]);

  const step = steps[index];

  const openPage = () => {
    setVisited((prev) => ({ ...prev, [index]: true }));
    setCompact(true);
    onNavigate(step.destination);
    window.requestAnimationFrame(() => compactRef.current?.focus());
  };

  const advance = () => {
    if (index === steps.length - 1) {
      onFinish();
      return;
    }

    setIndex(index + 1);

    // keep focus on the guide when moving between steps
    if (!compact) closeRef.current?.focus();
  };

  const content = (
    <>
      <div className="dt-guide-top">
        <span>
          GETTING STARTED · {index + 1} OF {steps.length}
        </span>

        <button
          type="button"
          ref={compact ? undefined : closeRef}
          onClick={onFinish}
          aria-label="Skip setup guide"
        >
          ×
        </button>
      </div>

      <div
        className="dt-guide-progress"
        aria-label={`Step ${index + 1} of ${steps.length}`}
      >
        {steps.map((_, i) => (
          <span key={i} className={i <= index ? "active" : ""} />
        ))}
      </div>

      <h2 id="dt-guide-title">{step.title}</h2>
      <p id="dt-guide-detail">{step.description}</p>

      {visited[index] && (
        <p className="dt-guide-visited">
          ✓ Relevant page opened; Please explore the rest at your own pace :)
        </p>
      )}

      <div className="dt-guide-actions">
        {index > 0 && (
          <button
            type="button"
            className="dt-guide-skip"
            onClick={() => setIndex(index - 1)}
          >
            Back
          </button>
        )}

        <button type="button" className="dt-guide-open" onClick={openPage}>
          {step.action}
        </button>

        <button type="button" className="dt-guide-next" onClick={advance}>
          {index === steps.length - 1 ? "Finish guide" : "Next step"}
        </button>
      </div>
    </>
  );

  if (compact) {
    return (
      <aside
        className="dt-guide-compact"
        aria-label="Getting started walkthrough"
      >
        <button
          ref={compactRef}
          className="dt-guide-expand"
          type="button"
          onClick={() => setCompact(false)}
          aria-label="Expand setup guide"
        >
          Setup guide · {index + 1}/4
          <span aria-hidden="true">↗</span>
        </button>

        <div className="dt-guide-compact-body">
          <strong>{step.title}</strong>
          <p>{step.description}</p>

          <div className="dt-guide-actions">
            <button type="button" className="dt-guide-open" onClick={openPage}>
              Open page
            </button>

            <button type="button" className="dt-guide-next" onClick={advance}>
              {index === steps.length - 1 ? "Finish" : "Next"}
            </button>

            <button type="button" className="dt-guide-skip" onClick={onFinish}>
              Skip
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className="dt-guide-scrim">
      <section
        className="dt-guide"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dt-guide-title"
        aria-describedby="dt-guide-detail"
      >
        {content}
      </section>
    </div>
  );
}