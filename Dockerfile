FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY assets ./assets
COPY src ./src
RUN bun run build

FROM oven/bun:1-slim AS runtime
WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

RUN mkdir -p /data && chown -R bun:bun /data /app
USER bun

ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/data/mendel.sqlite

VOLUME ["/data"]
EXPOSE 8080

ENTRYPOINT ["bun", "run", "src/index.ts"]
