// SPDX-License-Identifier: Apache-2.0

// Docs navigation data. The layout hands it to the sidebar and the pager reads
// DOCS_PAGES, so the two can never disagree.

export type DocsNavItem = { href: string; label: string };
/** `hue` marks the group in the sidebar: a wayfinding colour, not a status. */
export type DocsNavGroup = { label: string; hue: string; items: DocsNavItem[] };

export const DOCS_NAV: DocsNavGroup[] = [
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

export const DOCS_PAGES: DocsNavItem[] = DOCS_NAV.flatMap((g) => g.items);
