# AGENTS.md

## Overview

**mendel** is a web-based chat interface for testing programs built on top of [Evolution API](https://github.com/evolution-foundation/evolution-api). It bypasses Evolution API's instance setup requirements and eliminates the need to link a live WhatsApp account via WhatsApp Web during development and testing.

### Core Workflow

1. Connect `mendel` as a webhook producer and Evolution API drop-in endpoint to a service designed to work with Evolution API.
2. Messages sent in the `mendel` chat interface are forwarded as Evolution API-compatible webhook payloads (`MESSAGES_UPSERT`) to the target service.
3. Outbound API calls made by the service (such as `/message/sendText/:instance`, `/message/sendMedia/:instance`, etc.) are received by `mendel` and rendered in the chat interface as replies.
4. Supports sending and receiving text, images, and videos.

### Target Compatibility

A primary reference consumer is [DietIA](https://github.com/Danton-org/dietia). The end goal of `mendel` is to serve as a drop-in replacement for the Evolution API service in DietIA's development environment.

## Technology Stack

- **Runtime & Web Server**: [Bun](https://bun.sh/) using its native HTTP server (`Bun.serve`).
- **Database**: Bun's native SQLite module (`bun:sqlite`).
- **Frontend Interactivity**: [HTMX](https://htmx.org/).
- **Styling & Theming**: [Beer CSS](https://www.beercss.com/) themed around `#cf5114`.

## Distribution & CI/CD

- **Primary Distribution**: Docker container images hosted on GitHub Container Registry (`ghcr.io`).
- **Docker & Docker Compose**: A `Dockerfile` and `docker-compose.yaml` are provided so users can build and run `mendel` directly with standard Docker tooling (`docker compose up -d --build`).
- **Environment Configuration**: Never add or modify an `environment` key in `docker-compose.yaml`. Define default environment variables in `.env.example` and instruct users to configure their `.env` file instead.

## Nix

- **Image Building**: In Nix/CI workflows, use `pkgs.dockerTools.streamLayeredImage` to build reproducible layered container images and **skopeo** to push them to `ghcr.io`.
- **Reference Implementation**: See [any2nix](https://github.com/gbr-ufs/any2nix) for the canonical Nix flake and GitHub Actions setup using `streamLayeredImage` and `skopeo`.
- **Ad-Hoc Packages**: Tools defined in `devShells` are available in `$PATH` when the shell is active. To run a Nix package that is not in `$PATH`, use `nix run nixpkgs#<PACKAGE>`.

## Versioning & Commit Conventions

- **Versioning Scheme**: [ChronVer](https://chronver.org/) (`YYYY.MM.DD` / `YYYY.MM.DD.PATCH`).
- **Commit Style**: Linux Kernel Style ("Subsystem Prefix Style"):
  - Format: `<subsystem>: <imperative summary>` (e.g., `server: handle sendMedia endpoint`, `nix: add docker image output`, `ui: apply #cf5114 dynamic theme`).
  - Keep subject lines concise, lowercase after the subsystem prefix (except proper nouns/acronyms), and without a trailing period.
- **Code Documentation**: Document every module (`@packageDocumentation`) and every function, method, class, interface, and type following [TSDoc](https://tsdoc.org/).
