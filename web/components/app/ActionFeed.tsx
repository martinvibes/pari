// SPDX-License-Identifier: Apache-2.0

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/app/(app)/actions";

// The ledger's verdict on the last action, shown in one place. It lives in the
// app layout, so it survives the re-render that often removes the form that
// started the action (a settled request takes its Settle button with it).
// A refusal carries the model's `Pari: …` reason, which names the rule that
// must hold, so it is shown under "Ledger rule not met".

type Entry = { id: number; label: string; state: "pending" | "ok" | "refused" | "failed"; message: string };

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

const HEADINGS: Record<Entry["state"], string> = {
  pending: "Submitting to the ledger",
  ok: "Committed",
  refused: "Ledger rule not met",
  failed: "Failed",
};

export function ActionFeed({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const nextId = useRef(0);

  const begin = useCallback((label: string) => {
    const id = ++nextId.current;
    setEntry({ id, label, state: "pending", message: label });
    return id;
  }, []);

  const settle = useCallback((id: number, { ok, message }: ActionResult) => {
    const refused = !ok && message.startsWith("Pari: ");
    const state = ok ? "ok" : refused ? "refused" : "failed";
    const shown = refused ? message.charAt(6).toUpperCase() + message.slice(7) : message;
    setEntry((current) => (current?.id === id ? { ...current, state, message: shown } : current));
  }, []);

  useEffect(() => {
    if (!entry || entry.state === "pending") return;
    const timer = setTimeout(
      () => setEntry((current) => (current?.id === entry.id ? null : current)),
      entry.state === "ok" ? 6000 : 12000,
    );
    return () => clearTimeout(timer);
  }, [entry]);

  const feed = useMemo(() => ({ begin, settle }), [begin, settle]);

  return (
    <FeedContext.Provider value={feed}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-end sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {entry ? (
          <div className="card pointer-events-auto w-full max-w-md px-5 py-4 sm:w-[26rem]">
            <div className="flex items-center justify-between gap-4">
              <p className="flex items-center gap-2.5 label-data">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-pill ${
                    entry.state === "pending"
                      ? "glow-signal-dot animate-pulse bg-amber motion-reduce:animate-none"
                      : entry.state === "ok"
                        ? "bg-paper"
                        : "bg-red-400"
                  }`}
                />
                {HEADINGS[entry.state]}
              </p>
              {entry.state === "pending" ? null : (
                <button
                  type="button"
                  onClick={() => setEntry(null)}
                  className="text-xs uppercase tracking-[0.12em] text-ash transition hover:text-paper"
                >
                  Close
                </button>
              )}
            </div>
            <p
              className={`mt-2 text-sm leading-relaxed ${
                entry.state === "refused" || entry.state === "failed" ? "text-red-400" : "text-paper"
              }`}
            >
              {entry.state === "pending" ? `${entry.label}…` : entry.message}
            </p>
          </div>
        ) : null}
      </div>
    </FeedContext.Provider>
  );
}
