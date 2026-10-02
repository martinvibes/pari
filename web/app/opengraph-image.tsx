// SPDX-License-Identifier: Apache-2.0

import { ImageResponse } from "next/og";
import { MARK_PATH } from "@/lib/mark";

export const alt = "Pari, the private ledger for syndicated loans";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "72px 88px",
          background: "#000000",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="120" height="120" viewBox="0 0 24 24">
            <path d={MARK_PATH} fill="#FFFFFF" />
          </svg>
          <span style={{ fontSize: 132, fontWeight: 600, letterSpacing: -4 }}>pari</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 56, fontWeight: 300, letterSpacing: -1 }}>
            The private ledger for syndicated loans.
          </span>
          <span style={{ fontSize: 24, letterSpacing: 6, color: "#6D6D6D", textTransform: "uppercase" }}>
            Canton · CIP-56 settlement · DvP trades
          </span>
        </div>
      </div>
    ),
    size,
  );
}
