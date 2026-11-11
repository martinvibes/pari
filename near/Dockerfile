# SPDX-License-Identifier: Apache-2.0

# The hosted NEAR demo: the web app alone. The deal itself lives on NEAR
# testnet, so the container holds no ledger, only the demo's keys, which it
# reads from the environment (near/scripts: `npm run demo:env` writes them to a
# private file).
#
#   docker build -f near/Dockerfile -t pari-near .
#   docker run -p 3000:3000 --env-file near/.keys/demo.env pari-near

FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# The home page is built ahead of time, so the build has to know it is the NEAR one.
ENV PARI_BACKEND=near
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=web /web/.next/standalone ./
COPY --from=web /web/.next/static ./.next/static
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PARI_BACKEND=near
EXPOSE 3000
CMD ["node", "server.js"]
