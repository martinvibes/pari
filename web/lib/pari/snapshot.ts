// SPDX-License-Identifier: Apache-2.0

import "server-only";
import { activeContracts, qualifiedName, type ActiveContract, type Contract } from "@/lib/ledger/client";
import { CIP56, T } from "@/lib/pari/ids";
import type * as P from "@/lib/pari/types";

// Everything one party can see on the ledger, read in a single call and split
// by template. Every screen is built from the snapshot of the party it is for,
// so a screen can never show what that party could not see.

export type Snapshot = {
  facilities: Contract<P.Facility>[];
  positions: Contract<P.Position>[];
  receipts: Contract<P.Receipt>[];
  requests: Contract<P.PaymentRequest>[];
  notices: Contract<P.PrepaymentNotice>[];
  dqLists: Contract<P.DqList>[];
  screenings: Contract<P.ScreeningResult>[];
  offers: Contract<P.TradeOffer>[];
  tickets: Contract<P.TradeTicket>[];
  desks: Contract<{ agent: string }>[];
  elections: Contract<P.InfoElection>[];
  documents: Contract<P.Document>[];
  accesses: Contract<P.DocumentAccess>[];
  holdings: Contract<P.HoldingView>[];
  allocations: Contract<P.AllocationView>[];
};

const TEMPLATES = Object.values(T);
const INTERFACES = [CIP56.Holding, CIP56.Allocation];

export async function snapshot(party: string): Promise<Snapshot> {
  const active = await activeContracts(party, { templates: TEMPLATES, interfaces: INTERFACES });

  function ofTemplate<V>(ref: string): Contract<V>[] {
    const name = qualifiedName(ref);
    return active.filter((c) => qualifiedName(c.templateId) === name) as Contract<V>[];
  }
  function ofInterface<V>(ref: string): Contract<V>[] {
    const name = qualifiedName(ref);
    return active.flatMap((c: ActiveContract) => (name in c.views ? [{ ...c, payload: c.views[name] as V }] : []));
  }

  return {
    facilities: ofTemplate(T.Facility),
    positions: ofTemplate(T.Position),
    receipts: ofTemplate(T.Receipt),
    requests: ofTemplate(T.PaymentRequest),
    notices: ofTemplate(T.PrepaymentNotice),
    dqLists: ofTemplate(T.DqList),
    screenings: ofTemplate(T.ScreeningResult),
    offers: ofTemplate(T.TradeOffer),
    tickets: ofTemplate(T.TradeTicket),
    desks: ofTemplate(T.AgentDesk),
    elections: ofTemplate(T.InfoElection),
    documents: ofTemplate(T.Document),
    accesses: ofTemplate(T.DocumentAccess),
    holdings: ofInterface(CIP56.Holding),
    allocations: ofInterface(CIP56.Allocation),
  };
}
