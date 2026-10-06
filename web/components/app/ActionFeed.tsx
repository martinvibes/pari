// SPDX-License-Identifier: Apache-2.0

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/app/(app)/actions";

// The ledger's verdict on the last action, as a receipt in one place. It lives
// in the app layout, so it survives the re-render that often removes the form
// that started the action (a settled request takes its Settle button with it).
//
// While the action runs, the receipt names it and counts the seconds. When the
// ledger answers it says what happened, in its colour: committed (mint), with
// the update id of each transaction the ledger wrote; or refused (rose), with
// the model's `Pari: …` reason, which names the rule that must hold. A refused
// or failed action commits nothing, and the receipt says so. A settled receipt
// drains away on its own; hovering it holds it.

type State = "pending" | "ok" | "refused" | "failed";

type Entry = {
  id: number;
  label: string;
  state: State;
  message: string;
  startedAt: number;
  /** Milliseconds from submit to the ledger's answer. */
  took?: number;
  updateIds?: string[];
};

type Feed = {
  begin: (label: string) => number;
  settle: (id: number, result: ActionResult) => void;
};

const FeedContext = createContext<Feed | null>(null);

export function useActionFeed(): Feed {
  const feed = useContext(FeedContext);
  if (!feed) throw new Error("useActionFeed must be used inside <ActionFeed>.");
  return feed;
}

const LOOK: Record<State, { heading: string; text: string; tint: string; bar: string; dwell: number }> = {
  pending: { heading: "Submitting to Canton", text: "text-amber", tint: "bg-amber/10 ring-amber/30", bar: "text-amber", dwell: 0 },
  ok: { heading: "Committed", text: "text-mint", tint: "bg-mint/10 ring-mint/30", bar: "bg-mint", dwell: 9000 },
  refused: { heading: "Ledger rule not met", text: "text-rose", tint: "bg-rose/10 ring-rose/30", bar: "bg-rose", dwell: 14000 },
  failed: { heading: "Failed", text: "text-rose", tint: "bg-rose/10 ring-rose/30", bar: "bg-rose", dwell: 14000 },
};

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** `1220ab…` ids are long; the head and tail are what people compare. */
function shortId(id: string): string {
  return id.length > 22 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id;
}

function StateIcon({ state }: { state: State }) {
  if (state === "pending") {
    // Three ledger blocks, written one after another.
    return (
      <span aria-hidden className="ledger-blocks flex items-end gap-[3px]">
        <span className="h-2 w-1.5 bg-amber" />
        <span className="h-3 w-1.5 bg-amber" />
        <span className="h-4 w-1.5 bg-amber" />
      </span>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      {state === "ok" ? (
        <path className="draw-on" d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path className="draw-on" d="M7 7l10 10M17 7L7 17" strokeLinecap="round" />
      )}
    </svg>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return <>{seconds(Math.max(0, now - since))}</>;
}

function UpdateId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure origin): the id stays selectable.
    }
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate font-mono text-[12px] text-smoke" title={id}>
        {shortId(id)}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-ash transition hover:text-paper"
      >
        {copied ? <span className="text-mint">Copied</span> : "Copy"}
      </button>
    </div>
  );
}

function Receipt({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const look = LOOK[entry.state];
  const pending = entry.state === "pending";
  const ids = entry.updateIds ?? [];

  return (
    <div className="receipt-enter group card pointer-events-auto w-full max-w-md overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.7)] sm:w-[27rem]">
      {/* Top track: a sweeping beam while the ledger works, then a bar in
          the verdict's colour that drains until the receipt dismisses. */}
      <div className="h-[3px] bg-white/[0.06]">
        {pending ? (
          <div className={`beam h-full ${look.bar}`} />
        ) : (
          <div
            key={entry.state}
            className={`drain h-full ${look.bar}`}
            style={{ "--drain": `${look.dwell}ms` } as React.CSSProperties}
            onAnimationEnd={onClose}
          />
        )}
      </div>

      <div className="flex gap-4 px-5 pb-5 pt-4">
        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill ring-1 ${look.tint} ${look.text}`}>
          <StateIcon state={entry.state} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${look.text}`}>{look.heading}</p>
            <span className="flex items-center gap-3">
              <span className="font-mono text-[12px] tabular-nums text-ash">
                {pending ? <Elapsed since={entry.startedAt} /> : seconds(entry.took ?? 0)}
              </span>
              {pending ? null : (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-m-1 p-1 text-ash transition hover:text-paper"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </span>
          </div>

          <p className="mt-1.5 text-[15px] font-semibold text-paper">{entry.label}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-smoke">
            {pending ? "Waiting for Canton to confirm and commit the transaction." : entry.message}
          </p>

          {entry.state === "ok" && ids.length > 0 ? (
            <div className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-3">
              <p className="label-data text-[11px]">{ids.length === 1 ? "Update id" : `${ids.length} transactions`}</p>
              {ids.map((id) => (
                <UpdateId key={id} id={id} />
              ))}
            </div>
          ) : null}

          {entry.state === "refused" || entry.state === "failed" ? (
            <p className="mt-3 border-t border-white/[0.08] pt-3 text-[13px] text-pewter">
              Nothing was committed: the ledger is as it was.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActionFeed({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const nextId = useRef(0);

  const begin = useCallback((label: string) => {
    const id = ++nextId.current;
    setEntry({ id, label, state: "pending", message: label, startedAt: Date.now() });
    return id;
  }, []);

  const settle = useCallback((id: number, { ok, message, updateIds }: ActionResult) => {
    const refused = !ok && message.startsWith("Pari: ");
    const state = ok ? "ok" : refused ? "refused" : "failed";
    const shown = refused ? message.charAt(6).toUpperCase() + message.slice(7) : message;
    setEntry((current) =>
      current?.id === id
        ? { ...current, state, message: shown, took: Date.now() - current.startedAt, updateIds }
        : current,
    );
  }, []);

  const feed = useMemo(() => ({ begin, settle }), [begin, settle]);
  const close = useCallback(() => setEntry(null), []);

  return (
    <FeedContext.Provider value={feed}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-auto sm:bottom-6 sm:right-6"
      >
        {entry ? <Receipt key={entry.id} entry={entry} onClose={close} /> : null}
      </div>
    </FeedContext.Provider>
  );
}
