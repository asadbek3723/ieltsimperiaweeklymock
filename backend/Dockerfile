# Production Dockerfile for Hugging Face Spaces (Node.js + Prisma)
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

# Generate Prisma Client & compile TypeScript
RUN npx prisma generate
RUN npm run build

# ── Runner Stage ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs as user 1000 with home /app
RUN useradd -m -u 1000 user
USER user
ENV HOME=/app \
    PATH=/app/node_modules/.bin:$PATH \
    PORT=7860 \
    NODE_ENV=production

WORKDIR /app

COPY --chown=user:user --from=builder /app/package*.json ./
COPY --chown=user:user --from=builder /app/node_modules ./node_modules
COPY --chown=user:user --from=builder /app/dist ./dist
COPY --chown=user:user --from=builder /app/prisma ./prisma
COPY --chown=user:user --from=builder /app/question_database ./question_database
COPY --chown=user:user --from=builder /app/uploads ./uploads

EXPOSE 7860

CMD ["node", "dist/server.js"]
