// SPDX-License-Identifier: Apache-2.0

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Wordmark } from "@/components/Logo";
import { hueOf } from "@/components/app/party";
import { PERSONAS, SEATS } from "@/lib/pari/personas";

// The app's chrome keeps two questions apart. A seat is whose eyes you are
// using: one card, switched from one palette or with a number key. A place is
// where you are: a plain list. They never share a row.

type Seat = { id: string; name: string; role: string; group: string; reads: string; href: string; hue: string; key: string };

/** A visitor's own account: the ninth seat, on NEAR. */
const YOU: Seat = {
  id: "you",
  name: "You",
  role: "Your own NEAR account",
  group: "Yourself",
  reads: "Signs in your own browser, and opens only your own envelope",
  href: "/you",
  hue: "#8E8E96",
  key: "9",
};

const REMEMBERED = "pari.seat";

function castOf(near: boolean): Seat[] {
  return PERSONAS.map((p, i) => ({
    id: p.id,
    name: p.name,
    // The public and private sides are the Canton build's; on NEAR a lender is a lender.
    role: near && p.seat === "lender" ? "Lender" : p.blurb,
    group: SEATS.find((s) => s.seat === p.seat)!.label,
    reads: p.reads,
    href: p.href,
    hue: hueOf(p.id),
    key: String(i + 1),
  }));
}

function remembered(): string | null {
  try {
    return window.sessionStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function Dot({ hue, className = "h-2 w-2" }: { hue: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-pill ${className}`} style={{ background: hue }} />;
}

export function Shell({ near, readOnly, network, repo }: { near: boolean; readOnly: boolean; network: string; repo: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const cast = useMemo(() => castOf(near), [near]);
  const seats = useMemo(() => (near ? [...cast, YOU] : cast), [cast, near]);
  const [last, setLast] = useState("agent");
  const [open, setOpen] = useState(false);

  // The seat is the screen you are on. A place that is nobody's desk keeps the
  // seat you came from.
  const here = seats.find((seat) => seat.href === pathname);
  useEffect(() => {
    if (here && here.id !== YOU.id) {
      setLast(here.id);
      try {
        window.sessionStorage.setItem(REMEMBERED, here.id);
      } catch {
        // Storage refused: the seat is remembered for this page only.
      }
    } else {
      const saved = remembered();
      if (saved) setLast(saved);
    }
  }, [here]);
  const desk = (here && here.id !== YOU.id ? here : cast.find((seat) => seat.id === last)) ?? cast[0]!;
  const seat = here ?? desk;

  const places = [
    { label: "Desk", short: "Desk", href: desk.href },
    { label: "Who sees what", short: "Who sees", href: "/visibility" },
    ...(near
      ? [
          { label: "Check a proof", short: "Proof", href: "/verify" },
          { label: "Your own account", short: "You", href: "/you" },
        ]
      : []),
  ];

  useEffect(() => {
    for (const href of [...seats.map((s) => s.href), "/visibility"]) router.prefetch(href);
  }, [router, seats]);

  // Number keys sit in a seat directly; ⌘K or Ctrl K opens the palette.
  // Typing in a form is left alone.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const pressed = seats.find((s) => s.key === event.key);
      if (pressed && pressed.href !== pathname) router.push(pressed.href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router, seats]);

  function sit(next: Seat) {
    setOpen(false);
    if (next.href !== pathname) router.push(next.href);
  }

  const demo = readOnly
    ? "This server holds no party's key, so it shows the deal as the public reads it."
    : near
      ? "The server holds a testnet key for every party, so one browser walks the deal. Each action is still signed by the one account entitled to it."
      : "One server signs for every party, so one browser walks the deal. Each screen still reads the ledger as its own party.";

  return (
    <>
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-white/[0.08] px-4 pb-[18px] lg:flex">
        <Link href="/" aria-label="Back to home" className="flex h-14 shrink-0 items-center pl-1 text-paper">
          <Wordmark />
        </Link>

        <p className="mx-1 mb-2 mt-3.5 text-[12px] text-ash">Sitting as</p>
        <div className="border border-white/[0.17] bg-coal p-3.5">
          <p className="flex items-center gap-2.5 text-[17px] font-medium leading-6 text-paper">
            <Dot hue={seat.hue} className="h-2.5 w-2.5" />
            {seat.name}
            <kbd className="kbd ml-auto">{seat.key}</kbd>
          </p>
          <p className="mt-0.5 text-[13px] text-pewter">{seat.role}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="mt-3.5 flex h-8 w-full items-center justify-between rounded-pill border border-white/[0.17] pl-3.5 pr-1.5 text-[13px] font-medium text-paper transition hover:border-paper"
          >
            Switch seat
            <span className="flex gap-[3px]">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>
        </div>
        <p className="mx-1 mt-2 text-[11.5px] text-graphite">
          Keys 1 to {seats.length} switch seat directly.
        </p>

        <div aria-hidden className="-mx-4 mb-1 mt-5 h-px shrink-0 bg-white/[0.08]" />

        <p className="mx-1 mb-2 mt-3.5 text-[12px] text-ash">Places</p>
        <nav aria-label="Places">
          {places.map((place) => {
            const on = pathname === place.href;
            return (
              <Link
                key={place.label}
                href={place.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 items-center border-l-2 pl-2.5 pr-3 text-[14px] transition-colors ${
                  on ? "border-paper bg-white/[0.06] font-medium text-paper" : "border-transparent text-pewter hover:text-paper"
                }`}
              >
                {place.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-white/[0.08] px-1 pt-3.5 text-[11.5px] leading-[1.55] text-ash">
          <p>
            <span className="font-medium text-amber">{readOnly ? "Read only." : "Demo mode."}</span> {demo}
          </p>
          <p className="mt-2 flex items-center justify-between gap-3 text-graphite">
            <span className="font-mono text-[11px]">{network}</span>
            <span className="flex gap-3">
              <Link href="/docs" className="transition hover:text-paper">
                Docs
              </Link>
              <a href={repo} className="transition hover:text-paper">
                GitHub
              </a>
            </span>
          </p>
        </div>
      </aside>

      {/* Below the sidebar's width: the seat on top, the places underneath. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-carbon px-5 py-3 lg:hidden">
        <div className="min-w-0">
          <p className="text-[12px] leading-4 text-ash">Sitting as</p>
          <p className="flex items-center gap-2 truncate text-[17px] font-medium leading-6 text-paper">
            <Dot hue={seat.hue} className="h-2.5 w-2.5" />
            {seat.name}
            <span className="truncate text-[13px] font-normal text-pewter">{seat.role}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="h-9 shrink-0 rounded-pill border border-white/[0.17] px-4 text-[13.5px] font-medium text-paper"
        >
          Switch seat
        </button>
      </div>
      <nav
        aria-label="Places"
        className="fixed inset-x-0 bottom-0 z-30 grid h-14 border-t border-white/[0.08] bg-carbon lg:hidden"
        style={{ gridTemplateColumns: `repeat(${places.length}, minmax(0, 1fr))` }}
      >
        {places.map((place) => {
          const on = pathname === place.href;
          return (
            <Link
              key={place.label}
              href={place.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center justify-center border-t-2 text-[14px] ${
                on ? "border-paper font-medium text-paper" : "border-transparent text-ash"
              }`}
            >
              {place.short}
            </Link>
          );
        })}
      </nav>

      {open ? <Palette seats={seats} current={seat.id} note={demo} readOnly={readOnly} onPick={sit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Every seat at the table, by role, with what its key opens. Type a name,
 *  move with the arrows, or press a seat's number. */
function Palette({
  seats,
  current,
  note,
  readOnly,
  onPick,
  onClose,
}: {
  seats: Seat[];
  current: string;
  note: string;
  readOnly: boolean;
  onPick: (seat: Seat) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(() => Math.max(0, seats.findIndex((seat) => seat.id === current)));
  const input = useRef<HTMLInputElement>(null);
  const wanted = query.trim().toLowerCase();
  const shown = wanted ? seats.filter((seat) => `${seat.name} ${seat.role} ${seat.group}`.toLowerCase().includes(wanted)) : seats;

  useEffect(() => {
    input.current?.focus();
  }, []);

  function onType(value: string) {
    const direct = /^[1-9]$/.test(value) ? seats.find((seat) => seat.key === value) : undefined;
    if (direct) return onPick(direct);
    setQuery(value);
    setIndex(0);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") onClose();
    else if (event.key === "ArrowDown") setIndex((i) => Math.min(shown.length - 1, i + 1));
    else if (event.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
    else if (event.key === "Enter" && shown[index]) onPick(shown[index]!);
    else return;
    event.preventDefault();
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 px-3 pt-[10vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch seat"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="mx-auto flex max-h-[80vh] w-full max-w-[784px] flex-col border border-white/[0.17] bg-coal shadow-[0_18px_50px_rgba(0,0,0,0.7)]"
      >
        <label className="flex h-11 shrink-0 items-center gap-2.5 border-b border-white/[0.08] px-4">
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" className="shrink-0 text-ash">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L13 13" />
          </svg>
          <input
            ref={input}
            value={query}
            onChange={(event) => onType(event.target.value)}
            placeholder="Sit as… type a name, or press its number"
            aria-label="Sit as"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-paper outline-none placeholder:text-graphite"
          />
          <kbd className="kbd">esc</kbd>
        </label>

        <ul role="listbox" aria-label="Seats" className="overflow-y-auto py-1">
          {shown.length === 0 ? <li className="px-4 py-3 text-[13px] text-ash">No seat by that name.</li> : null}
          {shown.map((seat, i) => {
            const first = i === 0 || shown[i - 1]!.group !== seat.group;
            return (
              <li key={seat.id} role="option" aria-selected={i === index} className={first && i > 0 ? "border-t border-white/[0.08]" : undefined}>
                <button
                  type="button"
                  onClick={() => onPick(seat)}
                  onMouseMove={() => setIndex(i)}
                  className={`grid min-h-9 w-full grid-cols-[72px_30px_minmax(0,1fr)_auto] items-center gap-y-0.5 px-4 py-1.5 text-left text-[13px] sm:grid-cols-[92px_34px_108px_minmax(0,1fr)_auto] ${
                    i === index ? "bg-white/[0.075] shadow-[inset_2px_0_0_#fff]" : ""
                  }`}
                >
                  <span className="text-[12px] text-graphite">{first ? seat.group : ""}</span>
                  <kbd className="kbd justify-self-start">{seat.key}</kbd>
                  <span className="flex items-center gap-2 font-medium text-paper">
                    <Dot hue={seat.hue} />
                    {seat.name}
                  </span>
                  <span className="col-span-2 col-start-3 text-[12.5px] text-pewter sm:col-span-1 sm:col-start-auto sm:truncate">{seat.reads}</span>
                  {seat.id === current ? (
                    <span className="col-start-4 row-start-1 rounded-pill border border-white/[0.17] px-2.5 text-[11.5px] leading-[18px] text-paper sm:col-start-auto">
                      Sitting here
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-white/[0.08] px-4 py-1.5 text-[11.5px] text-graphite">
          <span className="hidden items-center gap-1.5 sm:flex">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd>move
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <kbd className="kbd">↵</kbd>sit
          </span>
          <span className="text-ash sm:ml-auto">
            <span className="font-medium text-amber">{readOnly ? "Read only." : "Demo mode."}</span>{" "}
            <span className="sm:hidden">{note}</span>
            <span className="hidden sm:inline">{readOnly ? "No party's key is on this server." : "Each action is still signed by the one account entitled to it."}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
