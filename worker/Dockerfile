FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

FROM mcr.microsoft.com/playwright:v1.60.0-jammy AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# npm mineur (11.12 -> 11.21.2) : embarque tar 7.5.22 (CVE-2026-59873 corrigée)
RUN npm install -g --no-fund --no-audit npm@11.21.2 && npm cache clean --force

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Non-root : uid 1000 (utilisateur "pwuser" de l'image Playwright) ; chromium lance déjà --no-sandbox
USER pwuser

CMD ["node", "dist/index.js"]
