# Hang

Real-time communication platform built on [Media over QUIC](https://moq.dev).

Try it at [hang.live](https://hang.live).

## Architecture

Hang combines a closed-source application layer with an [open-source media streaming library](https://github.com/kixelated/moq):

- **app** — Web frontend built with SolidJS, Vite, and Tailwind CSS v4
- **api** — Backend running on Cloudflare Workers with Hono and Drizzle ORM
- **native** — Desktop/mobile app using Tauri v2
The frontend and backend share types via Hono RPC. Real-time media is streamed over WebTransport using the [MOQ protocol](https://github.com/moq-dev/moq), consumed as published npm packages (`@moq/*`).

## Project Structure

```
app/        Web frontend (SolidJS + Vite)
api/        Backend API (Cloudflare Workers + Hono)
native/     Desktop/mobile app (Tauri v2)
dev/        Local relay server config
```

## Prerequisites

**Required:**
- [bun](https://bun.sh) — package manager and runtime
- [just](https://github.com/casey/just) — command runner
- [Rust](https://rustup.rs) — for the native app

**Recommended:**
- [Nix](https://nixos.org) + [direnv](https://direnv.net) — handles all dependencies automatically via `flake.nix`

## Getting Started

Clone the repo:

```sh
git clone https://github.com/zachatrocity/onyx-web.git
cd onyx-web
```

**With Nix + direnv** (recommended):

```sh
direnv allow
just dev
```

**Without Nix:**

```sh
bun install
just dev
```

`just dev` starts three services concurrently:

- **api** — Cloudflare Workers dev server (via wrangler)
- **app** — Vite dev server on port 1420
- **relay** — MOQ relay server

## Paved-road deployment

The self-hosted path starts with the web app as a Docker image. The image serves
the built Vite app with nginx on port `8080` and writes `/config.js` at startup
from environment variables, so one published image can point at different API
origins without rebuilding.

Published image:

```sh
ghcr.io/zachatrocity/onyx-web/web:main
```

Run it directly:

```sh
docker run --rm \
  -p 8080:8080 \
  -e API_URL="https://api.example.com" \
  -e APP_URL="https://onyx.example.com" \
  ghcr.io/zachatrocity/onyx-web/web:main
```

Recommended Compose shape:

```yaml
services:
  web:
    image: ghcr.io/zachatrocity/onyx-web/web:main
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      API_URL: "https://api.example.com"
      APP_URL: "https://onyx.example.com"
```

Put this behind Caddy, Traefik, or Nginx for public TLS. The web container is
stateless; durable data still belongs to the API, object storage, and MOQ relay.
Today the API remains Cloudflare Workers-shaped, so a fully self-hosted install
still needs the API/storage/relay adapters described in the architecture work.

The `Publish web image` workflow builds and pushes the image to GHCR on `main`,
version tags matching `v*`, and manual dispatches.

## Commands

| Command | Description |
| --- | --- |
| `just dev` | Run all dev servers |
| `just check` | Run linting and type checks |
| `just fix` | Auto-fix formatting and lint issues |
| `just build` | Build all packages |
| `just deploy <env>` | Deploy API and app to Cloudflare |
| `just native` | Run the native desktop app |

## MOQ (Media over QUIC)

Hang uses [moq](https://github.com/moq-dev/moq) — an open-source library for real-time media streaming over WebTransport and QUIC. The `@moq/*` npm packages provide the protocol implementation, and the `moq-relay` binary (via nix flake) runs the local relay server. See [moq.dev](https://moq.dev) for full documentation.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE), at your option.
