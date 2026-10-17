# syntax=docker/dockerfile:1
# Bonded production image: Next.js standalone server (Node 22) + stdlib-only Python 3.12 agents.
#
#   docker build -t bonded .
#   docker run -p 3000:3000 -v bonded-data:/app/data \
#     -e BONDED_ADMIN_TOKEN=... -e BONDED_INTERNAL_TOKEN=... -e SPENDBENCH_ALLOWED_HOSTS=localhost bonded
#
# Layout inside the image (BONDED_ROOT=/app, the cwd for spawned `python3 -m agents...`):
#   /app/web/server.js            standalone Next server (+ traced node_modules, .next/static, public)
#   /app/agents/                  Python agents, runner, grader, red team
#   /app/scripts/start-prod.sh    entrypoint
#   /app/data/                    JSON store (mount a volume here) unless DATABASE_URL is set

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.12

# ---------------------------------------------------------------- deps
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
COPY --from=deps /app/web/node_modules ./node_modules
COPY web/ ./
# next.config.ts sets output: "standalone" => .next/standalone/server.js
RUN npm run build

# ---------------------------------------------------------------- node binary donor
FROM node:${NODE_VERSION}-bookworm-slim AS node

# ---------------------------------------------------------------- runtime
FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime
# libstdc++6: needed by the node binary; gosu: drop root after fixing volume ownership; ca-certificates: TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libstdc++6 ca-certificates gosu \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 bonded \
 && useradd --system --uid 1001 --gid bonded --home-dir /app --no-create-home --shell /usr/sbin/nologin bonded
COPY --from=node /usr/local/bin/node /usr/local/bin/node
RUN node --version && python3 --version

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=3000 \
    BIND_HOST=0.0.0.0 \
    BONDED_ROOT=/app \
    SPENDBENCH_ROOT=/app \
    SPENDBENCH_DATA_DIR=/app/data \
    SPENDBENCH_DEMO=0

WORKDIR /app
COPY --from=build --chown=bonded:bonded /app/web/.next/standalone ./web
COPY --from=build --chown=bonded:bonded /app/web/.next/static ./web/.next/static
COPY --from=build --chown=bonded:bonded /app/web/public ./web/public
COPY --chown=bonded:bonded agents ./agents
COPY --chown=bonded:bonded scripts/start-prod.sh ./scripts/start-prod.sh
RUN chmod 0755 /app/scripts/start-prod.sh \
 && mkdir -p /app/data /app/agents/results \
 && chown -R bonded:bonded /app/data /app/agents

# The entrypoint starts as root only to chown a mounted volume, then re-execs itself as `bonded` (uid 1001)
# via gosu; node and every Python child run unprivileged. To skip the root step entirely when your volume is
# already writable by uid 1001: docker run --user 1001:1001 ...
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["/app/scripts/start-prod.sh"]
