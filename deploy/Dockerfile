# SPDX-License-Identifier: Apache-2.0

# The hosted demo: a Canton sandbox with Pari, seeded with the demo deal, and
# the web app in front of it, in one container. Only the web app's port is
# published; the ledger is reachable from inside the container alone.
#
#   docker build -f deploy/Dockerfile -t pari-demo .
#   docker run -p 3000:3000 pari-demo

# Canton and Daml Script as dpm installs them for SDK 3.5.12, from Digital
# Asset's public component registry, and Pari's demo DAR from its GitHub
# release, each pinned by digest.
FROM debian:bookworm-slim AS components
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
ARG REGISTRY=https://europe-docker.pkg.dev/v2/da-images/public/components
ARG CANTON_LIB=sha256:21525b4d07ba5cf16046b76a11bb9bd8d0afbdc75f5aff15f2c103eef674c872
ARG DAML_SCRIPT=sha256:09584f122734c3b12eabcae4191bec7679b1260afc9a4f45a22c51ef7d64f341
ARG DEMO_DAR=https://github.com/martinvibes/pari/releases/download/v0.2.0/pari-demo-0.2.0.dar
ARG DEMO_DAR_SHA256=86eedbaaed9daf553045125151e51606f2ab49bdad10a016be55212ef0a91af6
WORKDIR /opt/pari
RUN set -eu; \
  fetch() { curl -fsSL -o "$1" "$2" && echo "$3  $1" | sha256sum -c -; }; \
  fetch canton-lib.tar.gz "$REGISTRY/canton-open-source/blobs/$CANTON_LIB" "${CANTON_LIB#sha256:}"; \
  mkdir canton && tar -xzf canton-lib.tar.gz -C canton && rm canton-lib.tar.gz; \
  mv "$(find canton -name 'canton-open-source-*.jar')" canton.jar && rm -rf canton; \
  fetch daml-script.jar "$REGISTRY/daml-script/blobs/$DAML_SCRIPT" "${DAML_SCRIPT#sha256:}"; \
  fetch pari-demo.dar "$DEMO_DAR" "$DEMO_DAR_SHA256"

# The web app, as a standalone Next.js server.
FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:20-bookworm-slim AS node

FROM eclipse-temurin:17-jre-jammy
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=components /opt/pari /opt/pari
WORKDIR /app
COPY --from=web /web/.next/standalone ./
COPY --from=web /web/.next/static ./.next/static
COPY deploy/start.sh /usr/local/bin/pari-demo
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PARI_CAST_FILE=/app/.pari/cast.json \
    PARI_NETWORK="Canton sandbox"
EXPOSE 3000
CMD ["pari-demo"]
