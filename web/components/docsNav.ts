// SPDX-License-Identifier: Apache-2.0

// Docs navigation data. Plain module (no "use client") so both the client
// sidebar and the server-rendered pager can consume the same source of truth;
// importing this from a client module would hand the server a client-reference
// proxy instead of an array.

export type DocsNavItem = { href: string; label: string };
/** `hue` marks the group in the sidebar: a wayfinding colour, not a status. */
export type DocsNavGroup = { label: string; hue: string; items: DocsNavItem[] };

export const DOCS_NAV: DocsNavGroup[] = [
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

export const DOCS_PAGES: DocsNavItem[] = DOCS_NAV.flatMap((g) => g.items);
