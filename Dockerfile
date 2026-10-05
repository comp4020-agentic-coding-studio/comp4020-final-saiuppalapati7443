# syntax = docker/dockerfile:1

# Cairn: a shared, persistent, real-time cairn (see README.md). Node 24 type-
# strips and runs the TypeScript source directly, so there's no build stage
# and no transpiler dependency — see docs/adr/0001-stack.md for why. The one
# npm dependency (ws) is installed with --prod so nothing from spec/ or the
# dev toolchain ships in the image.

FROM node:24-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@11.9.0 && pnpm install --prod --frozen-lockfile

COPY src/ src/
COPY public/ public/
COPY docs/ docs/
COPY README.md ./

# /data is the Fly volume (fly.toml); DATA_DIR tells src/db.ts to put the
# sqlite file there instead of its local-dev fallback.
ENV DATA_DIR=/data
ENV PORT=8080

CMD ["node", "src/server.ts"]
