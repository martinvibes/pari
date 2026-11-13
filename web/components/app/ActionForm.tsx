// SPDX-License-Identifier: Apache-2.0

"use client";

import { useState } from "react";
import type { ActionResult } from "@/app/(app)/actions";
import { useActionFeed } from "@/components/app/ActionFeed";

type ServerAction = (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** A form that submits one server action and reports the ledger's verdict to
 *  the action feed. `hidden` carries the contract ids and parties the action
 *  needs; `children` are the visible inputs, rendered above the button. */
export function ActionForm({
  action,
  label,
  hidden = {},
  children,
  variant = "solid",
  disabled = false,
  className = "",
}: {
  action: ServerAction;
  label: string;
  hidden?: Record<string, string>;
  children?: React.ReactNode;
  variant?: "solid" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const feed = useActionFeed();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    const id = feed.begin(label);
    try {
      feed.settle(id, await action(null, form));
    } catch {
      feed.settle(id, { ok: false, message: "The server did not answer. Is the app still running?" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <button
        type="submit"
        disabled={disabled || pending}
        className={variant === "solid" ? "btn-solid" : "btn-ghost"}
      >
        {pending ? (
          <span
            aria-hidden
            className={`h-3.5 w-3.5 animate-spin rounded-pill border ${
              variant === "solid" ? "border-ink/40 border-t-ink" : "border-white/30 border-t-paper"
            }`}
          />
        ) : null}
        {label}
      </button>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </form>
  );
}
