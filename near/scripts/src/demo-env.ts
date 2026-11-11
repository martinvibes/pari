// Writes the environment a hosted copy of the web app needs to play the deal:
// where the deal lives, and the demo's testnet key and view key for every
// party. The file goes to near/.keys/demo.env, which git ignores. The keys are
// never printed.
//
//   npm run demo:env

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accountOf, DAO, OPERATORS, PERSONAS, ROOT } from "./lib/deal.js";
import { state } from "./lib/ledger.js";
import { keyFor } from "./lib/network.js";
import { haveViewKeys, viewKeyFor } from "./lib/viewkeys.js";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "../../.keys/demo.env");

const { agent, parties } = await state();
if (!haveViewKeys(parties)) {
  throw new Error("this machine does not hold the parties' view keys: run `npm run setup` first");
}

const lines = ["PARI_BACKEND=near", `PARI_ROOT=${ROOT}`];
for (const persona of PERSONAS) {
  // The agent's envelope is sealed to the key of the account that is the deal's agent.
  const viewer = persona === "agent" ? agent : accountOf(persona);
  lines.push(`NEAR_KEY_${persona.toUpperCase()}=${keyFor(accountOf(persona))}`);
  lines.push(`VIEW_KEY_${persona.toUpperCase()}=${(await viewKeyFor(viewer)).privateKey}`);
}
// When the agent is the DAO, its operators sign the agent's actions.
if (agent === DAO) {
  for (const operator of OPERATORS) lines.push(`NEAR_KEY_${operator.split(".")[0]!.toUpperCase()}=${keyFor(operator)}`);
}

mkdirSync(dirname(FILE), { recursive: true });
const existed = existsSync(FILE);
writeFileSync(FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(`${existed ? "Rewrote" : "Wrote"} ${FILE}: ${lines.length} variables for ${ROOT} (testnet keys; keep the file private).`);
