# ── Stage 1: build ────────────────────────────────────────────────────────────
# Install all deps (including devDeps) and compile TypeScript.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# Start fresh with only production deps + the compiled output.
# This keeps the final image small — no TypeScript compiler, no test libs.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public

EXPOSE 3000

CMD ["node", "dist/server.js"]
