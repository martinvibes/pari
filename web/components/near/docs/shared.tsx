// SPDX-License-Identifier: Apache-2.0

import { SITE } from "@/lib/site";
import { txUrl } from "@/lib/near/config";

// Links the NEAR docs pages share. The pages follow the README, section by
// section, so a reader of either finds the same words and the same figures.

/** The demo the README links to: the builder's live deal on NEAR testnet. */
export const HOSTED_DEMO = "https://pari-web-production-5ff7e57a.up.railway.app";

/** A file or folder of the repository, on GitHub. */
export function repoUrl(path: string): string {
  return `${SITE.repo}/${path.includes(".") ? "blob" : "tree"}/main/${path}`;
}

/** One testnet transaction, shown by the first eight characters of its hash. */
export function Tx({ hash }: { hash: string }) {
  return (
    <a href={txUrl(hash)}>
      <code>{hash.slice(0, 8)}…</code>
    </a>
  );
}

/** A test, written "suite: test_name": the suite in words, the name as code. */
export function TestName({ id }: { id: string }) {
  const [suite, name] = id.split(": ");
  return (
    <>
      {suite} <code>{name}</code>
    </>
  );
}
