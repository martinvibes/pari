// SPDX-License-Identifier: Apache-2.0

// The status pill, shared by the app screens and the docs.

/** What a status means, and so its colour. `wait` is live: it pulses. */
export type Tone = "neutral" | "ok" | "wait" | "stop" | "info" | "private";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  neutral: { pill: "border-white/15 bg-white/[0.04] text-smoke", dot: "bg-ash" },
  ok: { pill: "border-mint/30 bg-mint/10 text-mint", dot: "bg-mint shadow-[0_0_8px_rgba(61,220,151,0.7)]" },
  wait: {
    pill: "border-amber/30 bg-amber/10 text-amber",
    dot: "glow-signal-dot animate-pulse bg-amber motion-reduce:animate-none",
  },
  stop: { pill: "border-rose/30 bg-rose/10 text-rose", dot: "bg-rose shadow-[0_0_8px_rgba(255,92,114,0.7)]" },
  info: { pill: "border-sky/30 bg-sky/10 text-sky", dot: "bg-sky" },
  private: { pill: "border-iris/30 bg-iris/10 text-iris", dot: "bg-iris" },
};

/** A pill status label: a dot and a word, both in the status's colour. */
export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] ${TONES[tone].pill}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-pill ${TONES[tone].dot}`} />
      {children}
    </span>
  );
}
