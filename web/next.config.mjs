// SPDX-License-Identifier: Apache-2.0

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app shows its own progress (the ledger receipt and the route loading
  // state); the dev server's corner spinner only competes with it.
  devIndicators: { buildActivity: false },
  // The hosted demo (deploy/Dockerfile) runs the self-contained server.
  output: "standalone",
  // Privy asks for these two only to fund a Solana wallet and to run inside a
  // Farcaster mini app. Neither is used here, so they resolve to nothing.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@solana-program/system": false, "@farcaster/mini-app-solana": false };
    return config;
  },
};

export default nextConfig;
