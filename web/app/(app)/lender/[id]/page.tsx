// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LenderScreen } from "@/components/near/LenderScreen";
import { personaById, type Persona } from "@/lib/pari/personas";

type Params = { params: { id: string } };

function lenderPersona(id: string): Persona {
  const persona = personaById(id);
  if (!persona || persona.role !== "lender") notFound();
  return persona;
}

export function generateMetadata({ params }: Params): Metadata {
  return { title: personaById(params.id)?.name ?? "Lender" };
}

export default function LenderPage({ params }: Params) {
  return <LenderScreen persona={lenderPersona(params.id)} />;
}
