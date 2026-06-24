# ── Stage 1: Production-only dependencies ─────────────────────────────────────
FROM oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS proddeps

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS runtime

WORKDIR /app

# Copy production node_modules only (no Playwright/TypeScript/Biome)
COPY --from=proddeps /app/node_modules ./node_modules

# Copy application source
COPY package.json bun.lock* ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY public/ ./public/
COPY scripts/migrate.ts ./scripts/migrate.ts

# Create a volume for the SQLite database
RUN mkdir -p /app/data && chown -R bun:bun /app/data
VOLUME /app/data

# Expose the default port
ENV PORT=3000
ENV DB_PATH=/app/data/clickdown.db
# Enables strict CSRF/Origin checks (secure cookies require APP_URL=https or COOKIE_SECURE=true)
ENV NODE_ENV=production
EXPOSE 3000

USER bun

# Graceful shutdown: send SIGTERM so the app can close the DB and sockets
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:'+(process.env.PORT||3000)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Startup applies pending local SQLite migrations before accepting requests.
CMD ["bun", "run", "start"]
