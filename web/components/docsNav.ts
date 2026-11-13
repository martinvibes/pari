// SPDX-License-Identifier: Apache-2.0

import { BACKEND } from "@/lib/backend";

// Docs navigation data, one list per build. The server picks the list: the
// layout hands it to the sidebar (a client component, which cannot read the
// server's environment) and the pager reads DOCS_PAGES, so the two can never
// disagree.

export type DocsNavItem = { href: string; label: string };
/** `hue` marks the group in the sidebar: a wayfinding colour, not a status. */
export type DocsNavGroup = { label: string; hue: string; items: DocsNavItem[] };

const CANTON_NAV: DocsNavGroup[] = [
  {
    label: "Overview",
    hue: "#FFC857",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/quickstart", label: "Quickstart" },
    ],
  },
  {
    label: "Concepts",
    hue: "#3DDC97",
    items: [
      { href: "/docs/roles", label: "Parties and roles" },
      { href: "/docs/lifecycle", label: "Facility lifecycle" },
    ],
  },
  {
    label: "Design",
    hue: "#5AC8FA",
    items: [
      { href: "/docs/settlement", label: "CIP-56 settlement" },
      { href: "/docs/trading", label: "Trading and screening" },
      { href: "/docs/privacy", label: "Who sees what" },
      { href: "/docs/governance", label: "The agent, two of three" },
    ],
  },
  {
    label: "Reference",
    hue: "#A78BFA",
    items: [
      { href: "/docs/authority", label: "Authority matrix" },
      { href: "/docs/security", label: "Limits and status" },
    ],
  },
];

const NEAR_NAV: DocsNavGroup[] = [
  {
    label: "Overview",
    hue: "#FFC857",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/quickstart", label: "Check it yourself" },
    ],
  },
  {
    label: "Concepts",
    hue: "#3DDC97",
    items: [
      { href: "/docs/roles", label: "Parties and roles" },
      { href: "/docs/lifecycle", label: "How an action runs" },
    ],
  },
  {
    label: "Design",
    hue: "#5AC8FA",
    items: [
      { href: "/docs/settlement", label: "Payments and the two guards" },
      { href: "/docs/trading", label: "Trading and screening" },
      { href: "/docs/privacy", label: "Who sees what" },
      { href: "/docs/leak-test", label: "The leak test" },
      { href: "/docs/proofs", label: "Prove one fact" },
      { href: "/docs/governance", label: "The agent, two of three" },
    ],
  },
  {
    label: "Reference",
    hue: "#A78BFA",
    items: [
      { href: "/docs/authority", label: "Authority matrix" },
      { href: "/docs/security", label: "Limits and status" },
    ],
  },
];

export const DOCS_NAV: DocsNavGroup[] = BACKEND === "near" ? NEAR_NAV : CANTON_NAV;

export const DOCS_PAGES: DocsNavItem[] = DOCS_NAV.flatMap((g) => g.items);
