// SPDX-License-Identifier: Apache-2.0

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app shows its own progress (the ledger receipt and the route loading
  // state); the dev server's corner spinner only competes with it.
  devIndicators: { buildActivity: false },
  // The hosted demo (deploy/Dockerfile) runs the self-contained server.
  output: "standalone",
};

export default nextConfig;
