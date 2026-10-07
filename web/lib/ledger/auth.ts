// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LEDGER } from "@/lib/ledger/config";
import { LedgerError } from "@/lib/ledger/errors";

// Bearer tokens for authenticated ledgers. A fixed token comes from
// PARI_LEDGER_TOKEN. A token file, as `scripts/devnet.sh login` writes it,
// holds a Keycloak access and refresh token: the access token is refreshed
// shortly before it expires and the file saved again, since Keycloak may
// rotate the refresh token.

type Tokens = { access_token: string; refresh_token?: string };

const REFRESH_MARGIN_MS = 60_000;

let refreshing: Promise<Tokens> | null = null;

/** The token to send to the ledger, or none for an open local sandbox. */
export async function bearerToken(): Promise<string | undefined> {
  if (LEDGER.token) return LEDGER.token;
  if (!LEDGER.tokenFile) return undefined;
  const tokens = await readTokens();
  if (claims(tokens.access_token).exp * 1000 - REFRESH_MARGIN_MS > Date.now()) return tokens.access_token;
  refreshing ??= refresh(tokens).finally(() => (refreshing = null));
  return (await refreshing).access_token;
}

/** The ledger user to submit as: PARI_LEDGER_USER, else the token's subject. */
export async function ledgerUser(): Promise<string> {
  if (LEDGER.userId) return LEDGER.userId;
  const token = await bearerToken();
  return token ? claims(token).sub : "pari-web";
}

function claims(token: string): { sub: string; exp: number } {
  return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
}

function tokenFile(): string {
  return resolve(process.cwd(), LEDGER.tokenFile!);
}

async function readTokens(): Promise<Tokens> {
  try {
    return JSON.parse(await readFile(tokenFile(), "utf8")) as Tokens;
  } catch {
    throw new LedgerError(`No ledger token at ${tokenFile()}. Run \`make devnet-login\`.`, 401);
  }
}

async function refresh(tokens: Tokens): Promise<Tokens> {
  const { tokenUrl, clientId } = LEDGER.oidc;
  if (!tokens.refresh_token || !tokenUrl || !clientId) {
    throw new LedgerError("The ledger token has expired. Run `make devnet-login`.", 401);
  }
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new LedgerError(`The ledger token could not be refreshed (${res.status}). Run \`make devnet-login\`.`, 401);
  }
  const next = { ...tokens, ...((await res.json()) as Tokens) };
  const file = tokenFile();
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
  await rename(tmp, file);
  return next;
}
