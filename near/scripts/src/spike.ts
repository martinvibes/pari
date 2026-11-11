// Go/no-go spikes 1 and 2, run against testnet.
//
// Spike 1: the spike contract calls OutLayer twice; the enclave's counter in
// worker storage must come back 1 then 2 (or n, n+1 on a rerun).
// Spike 2: seal a secret to the enclave's key, have the enclave open it and
// seal a reply to our key, open the reply, and check the transaction carried
// only ciphertext.

import { isDeepStrictEqual } from "node:util";
import { nearToYocto, teraToGas } from "near-api-js";
import { accountFor, provider, txUrl } from "./lib/network.js";
import { newViewKey, open, seal } from "./lib/seal.js";

const SPIKE = process.env.PARI_SPIKE_CONTRACT ?? "spike.paridesk.testnet";
const SIGNER = process.env.PARI_ROOT ?? "paridesk.testnet";
const DEPOSIT = nearToYocto("0.01"); // estimate_execution_cost for these limits: 0.007 NEAR

const signer = accountFor(SIGNER);

interface RunResult {
  hash: string;
  seconds: number;
  output: { ok: boolean; result?: Record<string, unknown>; error?: string } | null;
  log: string | undefined;
}

async function run(input: object): Promise<RunResult> {
  const started = Date.now();
  const tx = await signer.callFunctionRaw({
    contractId: SPIKE,
    methodName: "run",
    args: { input: JSON.stringify(input) },
    gas: teraToGas("300"),
    deposit: DEPOSIT,
    waitUntil: "FINAL",
  });
  const seconds = (Date.now() - started) / 1000;
  const status = tx.status as { SuccessValue?: string };
  const output = status.SuccessValue ? JSON.parse(Buffer.from(status.SuccessValue, "base64").toString()) : null;
  const log = tx.receipts_outcome.flatMap((r) => r.outcome.logs).find((l) => l.startsWith("spike run"));
  return { hash: tx.transaction.hash, seconds, output, log };
}

function report(label: string, r: RunResult): void {
  console.log(`\n${label}`);
  console.log(`  tx       ${txUrl(r.hash)}`);
  console.log(`  wall     ${r.seconds.toFixed(1)} s   chain: ${r.log ?? "(no callback log)"}`);
  console.log(`  output   ${JSON.stringify(r.output)}`);
}

function must(cond: boolean, message: string): void {
  if (!cond) {
    console.error(`\nFAIL: ${message}`);
    process.exit(1);
  }
}

async function spike1(): Promise<void> {
  console.log("Spike 1: contract → OutLayer → callback, private worker storage");
  const first = await run({ cmd: "count" });
  report("count #1", first);
  const second = await run({ cmd: "count" });
  report("count #2", second);
  const a = Number(first.output?.result?.count);
  const b = Number(second.output?.result?.count);
  must(first.output?.ok === true && second.output?.ok === true, "enclave did not answer ok");
  must(b === a + 1, `counter went ${a} → ${b}, expected consecutive`);
  console.log(`\nSpike 1 PASS: counter ${a} → ${b} across two contract-initiated runs`);
}

async function spike2(): Promise<void> {
  console.log("\nSpike 2: sealed envelopes");
  const pk = await run({ cmd: "pubkey" });
  report("enclave public key", pk);
  const enclaveKey = String(pk.output?.result?.pubkey ?? "");
  must(enclaveKey.length === 44, "no enclave public key");

  const secret = { trade_price: "98.2575", dq_list: ["rival.paridesk.testnet"] };
  const mine = await newViewKey();
  const sealed = await seal(JSON.stringify(secret), enclaveKey);
  const echo = await run({ cmd: "echo_sealed", sealed, reply_to: mine.publicKey });
  report("sealed round trip", echo);
  const reply = String(echo.output?.result?.reply ?? "");
  must(reply.length > 0, "enclave sent no sealed reply");

  const opened = JSON.parse(await open(reply, mine));
  console.log(`  opened   ${JSON.stringify(opened)}`);
  must(isDeepStrictEqual(opened.enclave_read, secret), "enclave read something else");

  // Everything a transaction puts on chain: args, logs, return values.
  const tx = await provider.viewTransactionStatusWithReceipts({ txHash: echo.hash, accountId: SIGNER, waitUntil: "FINAL" });
  const onChain = JSON.stringify(tx) + decodeArgs(tx);
  const leaks = ["98.2575", "rival.paridesk.testnet"].filter((s) => onChain.includes(s));
  must(leaks.length === 0, `plaintext on chain: ${leaks.join(", ")}`);
  console.log(`\nSpike 2 PASS: round trip opened; the transaction carries only ciphertext (checked ${onChain.length} bytes)`);
}

// Base64 args and return values hide plaintext from a naive search; decode them.
function decodeArgs(tx: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string" && v.length > 8 && /^[A-Za-z0-9+/=]+$/.test(v)) {
      out.push(Buffer.from(v, "base64").toString("latin1"));
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(tx);
  return out.join("\n");
}

await spike1();
await spike2();
