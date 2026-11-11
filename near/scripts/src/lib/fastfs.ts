// Publishing the enclave build where OutLayer's workers fetch it from.
//
// FastFS stores a file in the arguments of a NEAR transaction that fails on
// purpose (1 gas); an indexer then serves it over HTTPS. OutLayer checks the
// file's sha256 against the version's hash, so the host cannot swap the code.

import { createHash } from "node:crypto";
import { actions } from "near-api-js";
import { OUTLAYER, ROOT } from "./deal.js";
import { accountFor } from "./network.js";

const GATEWAY = process.env.FASTFS_GATEWAY ?? "https://test.fastfs.io";

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function borshString(text: string): Buffer {
  const bytes = Buffer.from(text, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/** FastfsData::Simple { relative_path, content: Some { mime_type, content } } in Borsh. */
function simpleFile(path: string, mime: string, content: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(content.length);
  return Buffer.concat([Buffer.from([0]), borshString(path), Buffer.from([1]), borshString(mime), length, content]);
}

async function served(url: string, hash: string): Promise<boolean> {
  const response = await fetch(url).catch(() => null);
  return !!response?.ok && sha256(new Uint8Array(await response.arrayBuffer())) === hash;
}

/**
 * Makes sure the gateway serves `wasm` and returns its URL. An upload can be
 * accepted and never served, so each try waits 90 s and then uploads again.
 */
export async function publish(wasm: Uint8Array): Promise<string> {
  if (wasm.length > 1 << 20) throw new Error("builds over 1 MB need a chunked upload");
  const hash = sha256(wasm);
  const url = `${GATEWAY}/${ROOT}/${OUTLAYER}/${hash}.wasm`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await served(url, hash)) return url;
    const upload = actions.functionCall("__fastdata_fastfs", simpleFile(`${hash}.wasm`, "application/wasm", wasm), 1n, 0n);
    await accountFor(ROOT).signAndSendTransaction({ receiverId: OUTLAYER, actions: [upload], throwOnFailure: false });
    for (let waited = 0; waited < 18; waited++) {
      if (await served(url, hash)) return url;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(`FastFS never served ${url}`);
}
