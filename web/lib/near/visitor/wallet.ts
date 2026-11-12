// SPDX-License-Identifier: Apache-2.0

import type { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import sodium from "libsodium-wrappers";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, PublicKey, Signer, teraToGas, type KeyPairString } from "near-api-js";
import type { Envelope, PartyView } from "@/lib/near/books";

// A visitor's own account, in the visitor's browser. Nothing here runs on the
// server: the browser holds what signs for the account, sends the account's
// transactions to NEAR itself, and opens the account's envelope with a view
// key that never leaves it.

/** Where the deal lives, as the server tells the browser. */
export type Net = { rpcUrl: string; explorerUrl: string; ledger: string; usdc: string; unitsPerCent: string };

/** Who the visitor is on NEAR: an account made by a key, and what signs for it. */
export type Identity = { account: string; signer: Signer; via: "privy" | "browser" };

/** The rules contract or the enclave refused the action. Nothing changed. */
export class Refusal extends Error {
  constructor(
    reason: string,
    readonly hash: string,
  ) {
    super(reason);
  }
}

// Privy -------------------------------------------------------------------------

type SignRawHash = ReturnType<typeof useSignRawHash>["signRawHash"];

/** Signs with a Privy embedded wallet. The key stays inside Privy's wallet;
 *  this hands it a transaction's hash and gets the signature back. A NEAR
 *  account made by a key is named by the key's public half, in hex. */
export class PrivySigner extends Signer {
  constructor(
    private readonly address: string,
    private readonly signRawHash: SignRawHash,
  ) {
    super();
  }

  async getPublicKey(): Promise<PublicKey> {
    return new PublicKey({ keyType: 0, data: unhex(this.address) });
  }

  protected async signBytes(bytes: Uint8Array): Promise<Uint8Array> {
    const { signature } = await this.signRawHash({ address: this.address, chainType: "near", hash: `0x${hex(bytes)}` });
    return unhex(signature.replace(/^0x/, ""));
  }
}

// A key made in this browser -----------------------------------------------------

const GUEST_KEY = "pari.you.key";
const GUEST_HERE = "pari.you.guest";

/** Signs in with a NEAR key this browser makes and keeps in its own storage. */
export function enterAsGuest(): Identity {
  let secret = localStorage.getItem(GUEST_KEY);
  if (!secret) {
    secret = KeyPair.fromRandom("ed25519").toString();
    localStorage.setItem(GUEST_KEY, secret);
  }
  localStorage.setItem(GUEST_HERE, "1");
  const pair = KeyPair.fromString(secret as KeyPairString);
  return { account: hex(pair.getPublicKey().data), signer: new KeyPairSigner(pair), via: "browser" };
}

/** The guest who was signed in when this browser last showed the page. */
export function returningGuest(): Identity | null {
  return localStorage.getItem(GUEST_HERE) ? enterAsGuest() : null;
}

/** Signs the guest out. The key stays in this browser for next time. */
export function leaveAsGuest(): void {
  localStorage.removeItem(GUEST_HERE);
}

// The view key --------------------------------------------------------------------

type ViewKey = { publicKey: string; privateKey: string };

/** The account's view key (X25519, base64), made once and kept in this browser. */
async function viewKeyOf(account: string): Promise<ViewKey> {
  await sodium.ready;
  const slot = `pari.you.viewKey.${account}`;
  const kept = localStorage.getItem(slot);
  if (kept) return JSON.parse(kept) as ViewKey;
  const pair = sodium.crypto_box_keypair();
  const key = { publicKey: b64(pair.publicKey), privateKey: b64(pair.privateKey) };
  localStorage.setItem(slot, JSON.stringify(key));
  return key;
}

// The account on NEAR -------------------------------------------------------------

/** What the chain says back about an action once the enclave has answered. */
type Outcome = { ok: boolean; refused?: string };

/** What the visitor's account holds, read from the chain. */
export type Own = {
  /** Test NEAR, in yocto. */
  near: bigint;
  /** Test USDC in the account itself, in cents. */
  wallet: bigint;
  /** Whether the chain holds this browser's view key for the account. */
  registered: boolean;
  /** The account's envelope as the chain holds it. */
  envelope: Envelope | null;
  /** The envelope, opened with this browser's view key. */
  view: PartyView | null;
};

export class Wallet {
  private readonly provider: JsonRpcProvider;
  private readonly signing: Account;

  constructor(
    private readonly net: Net,
    readonly identity: Identity,
  ) {
    this.provider = new JsonRpcProvider({ url: net.rpcUrl });
    this.signing = new Account(identity.account, this.provider, identity.signer);
  }

  txUrl(hash: string): string {
    return `${this.net.explorerUrl}/txns/${hash}`;
  }

  accountUrl(): string {
    return `${this.net.explorerUrl}/address/${this.identity.account}`;
  }

  /** Reads everything the screen shows about the account. */
  async look(): Promise<Own> {
    const { account } = this.identity;
    const key = await viewKeyOf(account);
    const [near, units, onChain, envelope] = await Promise.all([
      this.near(),
      this.read<string>(this.net.usdc, "ft_balance_of", { account_id: account }),
      this.read<string | null>(this.net.ledger, "view_key", { account_id: account }),
      this.read<Envelope | null>(this.net.ledger, "envelope", { account_id: account }),
    ]);
    const registered = onChain === key.publicKey;
    return {
      near,
      wallet: BigInt(units) / BigInt(this.net.unitsPerCent),
      registered,
      envelope: envelope ?? null,
      view: registered && envelope ? opened(envelope, key) : null,
    };
  }

  /** Puts the public half of this browser's view key on chain. From then on
   *  the enclave seals the account's view of the books to it after every action. */
  async registerViewKey(): Promise<string> {
    const { publicKey } = await viewKeyOf(this.identity.account);
    return this.act("register_view_key", { pubkey: publicKey });
  }

  /** Moves test USDC from the account into the deal, as its cash in the books. */
  async payIn(cents: bigint): Promise<string> {
    const amount = (cents * BigInt(this.net.unitsPerCent)).toString();
    const args = { receiver_id: this.net.ledger, amount, msg: JSON.stringify({ kind: "cash" }) };
    const { hash, result } = await this.send<string>(this.net.usdc, "ft_transfer_call", args, 1n);
    // The token hands everything back when the deal does not take the payment.
    if (BigInt(result ?? "0") === 0n) throw new Refusal("the deal did not take the payment", hash);
    return hash;
  }

  acceptTrade(tradeId: number): Promise<string> {
    return this.act("accept_trade", { trade_id: tradeId });
  }

  /** One action on the rules contract, which runs the enclave before it answers. */
  private async act(method: string, args: Record<string, unknown>): Promise<string> {
    const { hash, result } = await this.send<Outcome>(this.net.ledger, method, args);
    if (!result?.ok) throw new Refusal(result?.refused ?? "the enclave did not answer", hash);
    return hash;
  }

  private async near(): Promise<bigint> {
    try {
      return (await this.provider.viewAccount({ accountId: this.identity.account })).amount;
    } catch (error) {
      // An account made by a key exists on chain from its first transfer.
      if (/does not exist/.test((error as Error).message)) return 0n;
      throw error;
    }
  }

  private async read<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
    return (await this.provider.callFunction({ contractId, method, args })) as T;
  }

  /** Signs one function call as the account and sends it to NEAR. */
  private async send<T>(contractId: string, methodName: string, args: Record<string, unknown>, deposit = 0n): Promise<{ hash: string; result: T | null }> {
    let tx;
    try {
      tx = await this.signing.callFunctionRaw({ contractId, methodName, args, gas: teraToGas("300"), deposit, waitUntil: "FINAL" });
    } catch (error) {
      throw new Error(reason(error));
    }
    const status = tx.status as { SuccessValue?: string; Failure?: unknown };
    if (status.Failure) throw new Error(reason(status.Failure));
    return { hash: tx.transaction.hash, result: status.SuccessValue ? (JSON.parse(atob(status.SuccessValue)) as T) : null };
  }
}

/** The view inside an envelope, or null when this browser's key does not open
 *  it: the envelope was sealed before the key was registered. */
function opened(envelope: Envelope, key: ViewKey): PartyView | null {
  try {
    return JSON.parse(sodium.to_string(sodium.crypto_box_seal_open(unb64(envelope.sealed), unb64(key.publicKey), unb64(key.privateKey)))) as PartyView;
  } catch {
    return null;
  }
}

/** The contract's own words when it panics, or the error's message. */
function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(text);
  return panic ? panic[1]! : text;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

function b64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function unb64(text: string): Uint8Array {
  return sodium.from_base64(text, sodium.base64_variants.ORIGINAL);
}
