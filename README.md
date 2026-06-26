# Hang

Real-time communication platform built on [Media over QUIC](https://moq.dev).

Try it at [hang.live](https://hang.live).

## Architecture

Hang combines a closed-source application layer with an [open-source media streaming library](https://github.com/kixelated/moq):

- **app** — Web frontend built with SolidJS, Vite, and Tailwind CSS v4
- **api** — Hono backend with Drizzle ORM. The self-hosted path runs on Node.js with SQLite and filesystem storage; the older Cloudflare deployment path remains available for now.
- **native** — Desktop/mobile app using Tauri v2
The frontend and backend share types via Hono RPC. Real-time media is streamed over WebTransport using the [MOQ protocol](https://github.com/moq-dev/moq), consumed as published npm packages (`@moq/*`).

## Project Structure

```
app/        Web frontend (SolidJS + Vite)
api/        Backend API (Hono + Drizzle)
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

To run the self-hosted Node API locally instead of Wrangler, copy
`api/.env.selfhost.example`, fill in the OAuth and relay secrets, then run:

```sh
set -a
. api/.env.selfhost.example
set +a
bun --filter @hang/api run dev:node
```

## Paved-road deployment

The self-hosted path is Docker Compose with three containers:

- `relay` runs `moq-relay` on port `4443` for browser/native media transport.
- `api` runs the Hono API on Node.js 22, listens on port `3000`, stores SQLite at
  `/data/onyx.sqlite3`, and stores public/avatar objects under `/data/public`.
- `web` serves the built Vite app with nginx on port `8080` and writes
  `/config.js` at startup from environment variables.

The paved-road backup target is the API `/data` volume. Back up the full volume,
not just the SQLite file, because uploaded public/avatar objects live beside the
database. Before upgrades, stop the stack or take a filesystem snapshot so
`/data/onyx.sqlite3` and `/data/public` are captured together.

Required API environment variables are listed in `api/.env.selfhost.example`.
Startup fails fast when required URLs, secrets, OAuth provider settings,
`DATABASE_PATH`, or `PUBLIC_STORAGE_PATH` are missing or malformed.

Run the stack:

```sh
cp api/.env.selfhost.example api/.env.selfhost
just --justfile dev/justfile auth-key
# set RELAY_SECRET in api/.env.selfhost to the exact contents of dev/root.jwk
# edit the rest of api/.env.selfhost, then run:
docker compose up -d --build
```

### Stupid simple Docker Compose example

If you just want the smallest copy-paste starting point, this is the shape:

```yaml
services:
  api:
    image: ghcr.io/zachatrocity/onyx-web/api:main
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - api/.env.selfhost
    volumes:
      - onyx-data:/data

  web:
    image: ghcr.io/zachatrocity/onyx-web/web:main
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      API_URL: "http://localhost:3000"
      APP_URL: "http://localhost:8080"
    depends_on:
      api:
        condition: service_healthy

volumes:
  onyx-data:
```

That example assumes:
- API on `http://localhost:3000`
- web UI on `http://localhost:8080`
- durable SQLite + public storage mounted under the `onyx-data` volume

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
  relay:
    image: moqdev/moq-relay:latest
    restart: unless-stopped
    working_dir: /relay
    command: ["moq-relay", "root.toml"]
    ports:
      - "4443:4443/tcp"
      - "4443:4443/udp"
    volumes:
      - ./dev/root.toml:/relay/root.toml:ro
      - ./dev/root.jwk:/relay/root.jwk:ro

  api:
    image: ghcr.io/zachatrocity/onyx-web/api:main
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - api/.env.selfhost
    volumes:
      - onyx-data:/data
    depends_on:
      relay:
        condition: service_started

  web:
    image: ghcr.io/zachatrocity/onyx-web/web:main
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      API_URL: "https://api.example.com"
      APP_URL: "https://onyx.example.com"
    depends_on:
      api:
        condition: service_healthy

volumes:
  onyx-data:
```

Put this behind Caddy, Traefik, or Nginx for public TLS. The web container is
stateless; durable data belongs to the API `/data` volume and the MOQ relay
configuration.

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
