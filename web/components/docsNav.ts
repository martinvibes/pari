// SPDX-License-Identifier: Apache-2.0

// Docs navigation data. Plain module (no "use client") so both the client
// sidebar and the server-rendered pager can consume the same source of truth;
// importing this from a client module would hand the server a client-reference
// proxy instead of an array.

export type DocsNavItem = { href: string; label: string };
export type DocsNavGroup = { label: string; items: DocsNavItem[] };

export const DOCS_NAV: DocsNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/quickstart", label: "Quickstart" },
    ],
  },
  {
    label: "Concepts",
    items: [
      { href: "/docs/roles", label: "Parties and roles" },
      { href: "/docs/lifecycle", label: "Facility lifecycle" },
    ],
  },
  {
    label: "Design",
    items: [
      { href: "/docs/settlement", label: "CIP-56 settlement" },
      { href: "/docs/trading", label: "Trading and screening" },
      { href: "/docs/privacy", label: "Who sees what" },
    ],
  },
  {
    label: "Reference",
    items: [
      { href: "/docs/authority", label: "Authority matrix" },
      { href: "/docs/security", label: "Limits and status" },
    ],
  },
];

export const DOCS_PAGES: DocsNavItem[] = DOCS_NAV.flatMap((g) => g.items);
