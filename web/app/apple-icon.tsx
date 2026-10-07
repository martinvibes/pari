// SPDX-License-Identifier: Apache-2.0

import { ImageResponse } from "next/og";
import { MARK_PATH } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#000000" }}>
        <svg width="110" height="110" viewBox="0 0 24 24">
          <path d={MARK_PATH} fill="#FFFFFF" />
        </svg>
      </div>
    ),
    size,
  );
}
