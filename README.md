# mendel

Web-based chat interface and drop-in [Evolution API](https://github.com/evolution-foundation/evolution-api) test server.

`mendel` lets you test services built for Evolution API (such as [DietIA](https://github.com/Danton-org/dietia)) without setting up an Evolution API instance or linking a WhatsApp account via WhatsApp Web.

## Features

- **Outbound Webhooks (`messages.upsert`)**: Messages sent in the chat UI are dispatched as Evolution API-compatible webhook payloads (`conversation`, `imageMessage`, `videoMessage`, `buttonsResponseMessage`, `listResponseMessage`, `pollUpdateMessage`) with base64 media included.
- **Inbound Evolution API Endpoints**: Implements `/message/sendText/:instance`, `/message/sendMedia/:instance`, `/chat/updateMessage/:instance`, `/message/sendButtons/:instance`, `/message/sendList/:instance`, `/message/sendPoll/:instance`, and instance/webhook management endpoints.
- **Media Support**: Send and receive text, images, and videos.
- **Zero External Services**: Built on `Bun.serve` and `bun:sqlite`, with an HTMX + Beer CSS (`#cf5114` theme) web interface.

## Configuration

Settings can be configured in the web UI or via environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` / `SERVER_PORT` | `8080` | HTTP server port |
| `HOST` | `0.0.0.0` | HTTP bind address |
| `WEBHOOK_URL` | `http://localhost:8000/whatsapp` | Target webhook endpoint receiving `messages.upsert` events |
| `EVOLUTION_INSTANCE` | `dietia` | Default Evolution API instance name |
| `EVOLUTION_API_KEY` | *(empty)* | API key sent in `apikey` and `x-api-key` webhook headers |
| `SENDER_NUMBER` | `5511999999999` | Simulated WhatsApp sender phone number |
| `PUSH_NAME` | `Test User` | Simulated WhatsApp sender display name |
| `DATABASE_PATH` | `./mendel.sqlite` | Path to the SQLite database file |

## Usage

### Docker Compose

Run `mendel` directly from this repository using Docker Compose:

```bash
docker compose up -d --build
```

Or use the pre-built image from `ghcr.io` as a drop-in Evolution API replacement:

```yaml
services:
  evolution-api:
    image: ghcr.io/danton-org/mendel:dev
    environment:
      - WEBHOOK_URL=http://dietia:8000/whatsapp
      - EVOLUTION_INSTANCE=dietia
      - EVOLUTION_API_KEY=evolution-api-secret-key-12345
    ports:
      - "8081:8080"
```

Open `http://localhost:8080` (or `http://localhost:8081`) in your browser to chat with your service.

### Local Development

```bash
bun install
bun run start
```

### Nix

```bash
# Build and run the mendel binary
nix run .#mendel

# Build the layered Docker image stream script
nix build .#docker-mendel
```

## Documentation & Agent Guidelines

All TypeScript and JavaScript modules, classes, interfaces, types, and functions in this repository are documented following the [TSDoc](https://tsdoc.org/) specification (including `@packageDocumentation` on modules and `@param` / `@returns` tags on functions and methods). Future contributors and AI agents must document every new or modified module and function using TSDoc.
