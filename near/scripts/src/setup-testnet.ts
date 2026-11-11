// Sets the whole demo up on NEAR testnet. Safe to run again: every step
// checks the chain first and does only what is missing.
//
//   npm run setup            bring the current deal up to date
//   npm run setup -- --fresh start a new deal (new books in the enclave)
//
// Needs the root account's key in ~/.near-credentials/testnet and the builds
// from near/build.sh.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KeyPair, nearToYocto } from "near-api-js";
import {
  accountOf, FUNDING, LEDGER, money, OUTLAYER, PERSONAS, POSITIONS, PROJECT_ID, PROJECT_NAME, ROOT, TERMS, UNITS_PER_CENT, USDC,
} from "./lib/deal.js";
import { publish, sha256 } from "./lib/fastfs.js";
import { act, call, sealForEnclave, state, view, type PublicState } from "./lib/ledger.js";
import { accountFor, NETWORK, provider } from "./lib/network.js";
import { viewKeyFor } from "./lib/viewkeys.js";

const NEAR_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BUILDS = {
  ledger: join(NEAR_DIR, "contract/target/near/pari_ledger.wasm"),
  usdc: join(NEAR_DIR, "usdc/target/near/pari_test_usdc.wasm"),
  enclave: join(NEAR_DIR, "enclave/target/wasm32-wasip2/release/pari-core.wasm"),
};

/** Testnet NEAR each account is kept above. Contracts pay for their own storage;
 *  parties prepay about 0.3 NEAR of gas per action and get most of it back. */
const MIN_NEAR: Record<string, number> = { [LEDGER]: 5, [USDC]: 2.5, [accountOf("agent")]: 1.5 };
const DEFAULT_MIN_NEAR = 0.9;

function step(text: string): void {
  console.log(`\n▸ ${text}`);
}

function done(text: string): void {
  console.log(`  ${text}`);
}

function build(name: keyof typeof BUILDS): Uint8Array {
  if (!existsSync(BUILDS[name])) throw new Error(`${BUILDS[name]} is missing: run near/build.sh first`);
  return new Uint8Array(readFileSync(BUILDS[name]));
}

/** Creates `accountId` under the root with a new key in the near CLI keychain,
 *  or tops it up from the root if it has run low. */
async function ensureAccount(accountId: string): Promise<void> {
  const wanted = nearToYocto(MIN_NEAR[accountId] ?? DEFAULT_MIN_NEAR);
  const account = await provider.viewAccount({ accountId }).catch(() => null);
  if (!account) {
    const key = KeyPair.fromRandom("ed25519");
    const file = join(homedir(), ".near-credentials", NETWORK, `${accountId}.json`);
    mkdirSync(dirname(file), { recursive: true });
    const saved = { account_id: accountId, public_key: key.getPublicKey().toString(), private_key: key.toString() };
    writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
    await accountFor(ROOT).createSubAccount({ accountOrPrefix: accountId, publicKey: key.getPublicKey(), nearToTransfer: wanted });
    return done(`${accountId} created`);
  }
  // Contracts hold their NEAR against storage; only parties are topped up.
  const isParty = accountId !== LEDGER && accountId !== USDC;
  if (isParty && account.amount < (wanted * 2n) / 3n) {
    await accountFor(ROOT).transfer({ receiverId: accountId, amount: wanted - account.amount });
    return done(`${accountId} topped up`);
  }
  done(`${accountId} exists`);
}

/** Deploys `code` to `accountId` unless that exact code is already there. */
async function ensureCode(accountId: string, code: Uint8Array): Promise<void> {
  const deployed = await provider.viewContractCode({ contractId: accountId }).then((c) => sha256(c.code), () => null);
  if (deployed === sha256(code)) return done(`${accountId} already runs this build`);
  await accountFor(accountId).deployContract(code);
  done(`${accountId} deployed (sha256 ${sha256(code).slice(0, 12)}…)`);
}

/** Registers the enclave build as a version of the OutLayer project. */
async function ensureEnclaveVersion(hash: string, url: string): Promise<void> {
  const source = { WasmUrl: { url, hash, build_target: "wasm32-wasip2" } };
  const deposit = nearToYocto("0.1");
  if (!(await view(OUTLAYER, "get_project", { project_id: PROJECT_ID }))) {
    await call(ROOT, OUTLAYER, "create_project", { name: PROJECT_NAME, source }, deposit);
    return done(`project ${PROJECT_ID} created with version ${hash.slice(0, 12)}…`);
  }
  if (await view(OUTLAYER, "get_version", { project_id: PROJECT_ID, version_key: hash })) {
    return done(`project ${PROJECT_ID} already has version ${hash.slice(0, 12)}…`);
  }
  await call(ROOT, OUTLAYER, "add_version", { project_name: PROJECT_NAME, source, set_active: true }, deposit);
  done(`version ${hash.slice(0, 12)}… added to ${PROJECT_ID}`);
}

/**
 * Starts the deal on the contract, pinned to this enclave build. `previous` is
 * the deal that was there before this run deployed anything: the enclave keeps
 * each deal's books by its id, so a new deal needs the next number.
 */
async function ensureDeal(previous: PublicState | null, hash: string, fresh: boolean): Promise<PublicState> {
  const current = await state().catch(() => null);
  if (current && !fresh && current.version_key === hash) {
    done(`deal ${current.deal_id} is live on ${LEDGER}`);
    return current;
  }
  if (current && !fresh) {
    throw new Error(`${LEDGER} pins enclave build ${current.version_key}, not this one. Run with --fresh to start a new deal.`);
  }
  if (previous && !current && !fresh) {
    throw new Error(`this build of the contract cannot read deal ${previous.deal_id}. Run with --fresh to start a new deal.`);
  }
  const number = previous ? Number(previous.deal_id.split("-").pop()) : 0;
  const deal_id = process.env.PARI_DEAL ?? `northwind-${number + 1}`;
  const args = {
    owner: ROOT, deal_id, outlayer: OUTLAYER, project_id: PROJECT_ID, version_key: hash, usdc: USDC, terms: TERMS,
    agent: accountOf("agent"), borrower: accountOf("northwind"),
  };
  await call(LEDGER, LEDGER, "new", args);
  done(`deal ${deal_id} started, pinned to enclave build ${hash.slice(0, 12)}…`);
  return state();
}

/**
 * Removes what ended deals left in the contract's storage. A node refuses to
 * serve a contract's storage once it is large, and the leak test reads all of it.
 */
async function sweepEndedDeals(dealId: string): Promise<void> {
  const { values } = await provider.viewContractState({ contractId: LEDGER, prefix: "" });
  const stale = values
    .map((entry) => entry.key)
    .filter((key) => {
      const text = Buffer.from(key, "base64").toString("latin1");
      return text !== "STATE" && !text.startsWith(`${dealId}/`);
    });
  if (stale.length === 0) return done("no storage left by ended deals");
  for (let i = 0; i < stale.length; i += 100) await call(LEDGER, LEDGER, "sweep", { keys: stale.slice(i, i + 100) });
  done(`swept ${stale.length} storage keys left by ended deals`);
}

async function expectOk(what: string, sent: Promise<{ url: string; result: { ok: boolean; refused?: string } }>): Promise<void> {
  const { url, result } = await sent;
  if (!result?.ok) throw new Error(`${what} was refused: ${result?.refused ?? "no answer"} (${url})`);
  done(`${what}: ${url}`);
}

const fresh = process.argv.includes("--fresh");

step("Accounts");
for (const accountId of [LEDGER, USDC, ...PERSONAS.map(accountOf)]) await ensureAccount(accountId);

step("Test USDC");
await ensureCode(USDC, build("usdc"));
if (!(await view(USDC, "ft_metadata").catch(() => null))) {
  await call(USDC, USDC, "new", {});
  done("token initialised");
}

step("Enclave program");
const enclave = build("enclave");
const hash = sha256(enclave);
await ensureEnclaveVersion(hash, await publish(enclave));

step("Rules contract");
const previous = await state().catch(() => null);
await ensureCode(LEDGER, build("ledger"));
let deal = await ensureDeal(previous, hash, fresh);
await sweepEndedDeals(deal.deal_id);

if (!deal.enclave_key) {
  await expectOk("enclave key published", act(ROOT, "fetch_enclave_key"));
  deal = await state();
}
if (!deal.root) {
  step("The closed deal (positions sealed to the enclave)");
  const positions = Object.fromEntries(Object.entries(POSITIONS).map(([lender, cents]) => [lender, cents.toString()]));
  const sealed = await sealForEnclave({ positions });
  await expectOk("deal loaded", act(ROOT, "init_deal", { auditor: accountOf("auditor"), sealed }));
}

step("View keys");
for (const persona of PERSONAS) {
  const accountId = accountOf(persona);
  const key = await viewKeyFor(accountId);
  if ((await view<string | null>(LEDGER, "view_key", { account_id: accountId })) === key.publicKey) {
    done(`${accountId} registered`);
    continue;
  }
  await expectOk(`${accountId} view key`, act(accountId, "register_view_key", { pubkey: key.publicKey }));
}

step("Test USDC balances");
for (const accountId of [LEDGER, ...PERSONAS.map(accountOf)]) {
  const persona = PERSONAS.find((p) => accountOf(p) === accountId);
  const wanted = (persona ? FUNDING[persona] ?? 0n : 0n) * UNITS_PER_CENT;
  const registered = await view<unknown>(USDC, "storage_balance_of", { account_id: accountId });
  const balance = BigInt(await view<string>(USDC, "ft_balance_of", { account_id: accountId }));
  if (registered && balance >= wanted) {
    done(`${accountId} holds ${money(balance / UNITS_PER_CENT)}`);
    continue;
  }
  await call(ROOT, USDC, "mint", { account_id: accountId, amount: (wanted - balance).toString() });
  done(`${accountId} minted up to ${money(wanted / UNITS_PER_CENT)}`);
}

deal = await state();
console.log(`\nReady: deal ${deal.deal_id} on ${LEDGER}, books at seq ${deal.seq}, root ${deal.root}`);
