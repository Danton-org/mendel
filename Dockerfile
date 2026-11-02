# 1.4.4
FROM oven/bun@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY assets ./assets
COPY src ./src
RUN bun run build

# 1.4.4-slim
FROM oven/bun@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS runtime
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
