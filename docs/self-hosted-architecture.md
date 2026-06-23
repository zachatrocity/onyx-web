# Onyx self-hosted architecture

This is the target architecture for making Onyx practical to run on one VPS,
mini PC, NAS, or homelab node without depending on Cloudflare for the core
product.

## Recommendation

The paved-road deployment should be a single Docker Compose stack with two
runtime containers and one persistent volume:

- `onyx`: a long-running Node/Bun service that runs the existing Hono API,
  serves the static Vite build, and owns auth, account data, room token signing,
  avatar uploads, migrations, and health checks.
- `relay`: the MOQ relay process that terminates WebTransport/QUIC and enforces
  room tokens signed by the API.
- `onyx-data`: the durable application data volume containing SQLite, uploaded
  public files, relay key material, and generated runtime config.

Do not split this into more services yet. The app is small enough that an
external database, object store, queue, or service mesh would make self-hosting
worse before it makes the product better.

## What stays initially

Keep these pieces as close to the current repo shape as possible:

- The MOQ/WebTransport media path and `@moq/*` client packages.
- The room-token model in `api/src/room.ts`, where the API signs relay-scoped
  access tokens from `RELAY_SECRET`, `RELAY_PREFIX`, and `RELAY_URL`.
- The Hono API surface and Hono RPC client sharing between `api` and `app`.
- Drizzle's SQLite schema style and the existing migration files under
  `api/migrations`.
- The Solid/Vite frontend and Tauri native clients as consumers of the same API.
- `just dev`, `just check`, and `just build` as the local contributor commands.

The current code already has the right conceptual boundaries: browser app, API,
storage, database, and relay. The self-hosted work should change the runtime
adapters, not rewrite the product.

## What must be replaced

Cloudflare-specific bindings are the self-hosting blocker:

- D1 binding `env.DB` should become a file-backed SQLite database at
  `DATA_DIR/onyx.db`.
- R2 binding `env.PUBLIC` should become filesystem-backed object storage under
  `DATA_DIR/public`.
- Wrangler should remain useful for Cloudflare deploys, but production
  self-hosting should not require Wrangler, Cloudflare accounts, D1, or R2.
- Cloudflare Pages/static hosting should become a normal static build served by
  the same image or a compose-local static server.
- Cloudflare-managed secrets should become normal environment variables or
  Docker secrets.

The API should get a production server entrypoint separate from the Worker
entrypoint. Keep the route tree in `api/src/index.ts`, but add an adapter such
as `api/src/server.ts` that validates env, opens SQLite, wires filesystem
storage, runs migrations, and listens on `0.0.0.0:3000`.

## Runtime topology

Recommended default:

```text
internet
  |
reverse proxy with real TLS
  |-- https://onyx.example.com        -> web/api HTTP on TCP 3000
  |-- https://relay.onyx.example.com  -> MOQ relay HTTP/WebTransport on TCP/UDP 4443

docker compose project
  |-- api/web container
  |     |-- /data/onyx.db
  |     |-- /data/public
  |     `-- /data/relay/root.jwk
  `-- relay container
        `-- reads the same relay root key or a mounted copy
```

The simplest production image should build the frontend and API together, then
serve both from one API container:

- `/api/*`, `/auth/*`, `/account/*`, `/avatar/*`, `/room/*`, `/health/*`,
  `/public/*` go to Hono.
- all other routes serve the static Vite app with SPA fallback.

That gives self-hosters one HTTP upstream plus one relay upstream. A separate
`web` container can be supported later, but it should not be the primary path.

## Ports and TLS

Container ports:

- `3000/tcp`: API, static app, and `/health`.
- `4443/tcp`: relay HTTP/WebSocket compatibility path if enabled.
- `4443/udp`: WebTransport/QUIC relay path.

TLS assumption:

- The paved road should assume an external reverse proxy such as Caddy, Traefik,
  or Nginx owns public certificates for the app domain.
- The relay still needs a certificate story that WebTransport clients trust. For
  the paved road, document Caddy or Traefik terminating TLS where supported and
  proxying UDP/TCP to the relay only if the selected relay/proxy combination
  supports it. If the relay must terminate TLS itself, mount certificate files
  into the relay container and make that explicit.

Do not hide relay TLS behind vague "put it behind your proxy" docs. QUIC and
WebTransport proxy support is the sharp edge of this deployment.

## Persistence

Document exactly one durable mount:

```text
/data
  onyx.db
  public/
    avatar/
  relay/
    root.jwk
```

Backup target:

- stop the compose stack or use SQLite online backup,
- copy `/data/onyx.db`,
- copy `/data/public`,
- copy `/data/relay/root.jwk`.

The relay root key is user data. Losing it invalidates room token signing until
the API and relay are reconfigured together. Uploaded avatars are user data.

## Environment contract

Required for the self-hosted production server:

| Name | Purpose |
| --- | --- |
| `APP_URL` | Public browser origin, for OAuth redirects and absolute links. |
| `API_URL` | Public API origin. If API and app share a host, this can equal `APP_URL`. |
| `AUTH_SECRET` | Random JWT signing secret. Minimum 32 bytes. |
| `RELAY_URL` | Public relay URL used by clients. |
| `RELAY_PREFIX` | Namespace prefix for this installation, default `default`. |
| `RELAY_SECRET` | Relay signing key, preferably loaded from `/data/relay/root.jwk`. |
| `DATA_DIR` | Persistent data directory, default `/data`. |

Optional:

| Name | Purpose |
| --- | --- |
| `PORT` | API listen port, default `3000`. |
| `PUBLIC_STORAGE_DIR` | Override public file storage path, default `$DATA_DIR/public`. |
| `DATABASE_URL` | SQLite URL/path, default `$DATA_DIR/onyx.db`. |
| `LOG_LEVEL` | `info` by default, `debug` for support. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable Google login. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Enable Discord login. |
| `APPLE_CLIENT_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_CLIENT_SECRET` | Enable Apple login. |

OAuth providers should be optional. A self-hosted deployment needs at least one
login path, but the app should not require Google, Discord, and Apple all at
once. If no provider is configured, startup should fail with a clear message
until a local admin/bootstrap login exists.

## Compose shape

The future compose file should look roughly like this:

```yaml
services:
  onyx:
    image: ghcr.io/zachatrocity/onyx-web:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      APP_URL: "https://onyx.example.com"
      API_URL: "https://onyx.example.com"
      RELAY_URL: "https://relay.onyx.example.com"
      RELAY_PREFIX: "default"
      DATA_DIR: "/data"
    env_file:
      - .env
    volumes:
      - onyx-data:/data
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  relay:
    image: ghcr.io/zachatrocity/onyx-relay:latest
    restart: unless-stopped
    ports:
      - "4443:4443/tcp"
      - "4443:4443/udp"
    volumes:
      - onyx-data:/data:ro
    environment:
      RELAY_CONFIG: "/etc/onyx/relay.toml"

volumes:
  onyx-data:
```

The exact relay image depends on how the MOQ relay is packaged. If there is no
stable upstream image, Onyx should publish a thin relay image pinned to a known
`moq-relay` version.

## Upgrade and migration model

Container startup should be boring:

1. Validate required environment variables.
2. Ensure `DATA_DIR`, `public`, and `relay` directories exist.
3. Generate `relay/root.jwk` only on first boot if the user did not provide one.
4. Open SQLite.
5. Apply pending migrations once, with a migration lock.
6. Start HTTP server.

Never silently move user data. If a future release changes the data layout,
ship an explicit migration with a changelog entry.

SQLite backups should be documented before recommending automatic updates. The
backup instructions should say exactly which files are durable and which files
can be regenerated.

## Migration phases

### Phase 1: self-hostable API adapters

Must-have:

- Add a non-Worker API server entrypoint.
- Add SQLite adapter for Drizzle outside D1.
- Add filesystem storage adapter with the same logical API as R2 storage.
- Add strict startup env validation.
- Add `/health` that checks database readability and storage path access.
- Add `Dockerfile`, `.dockerignore`, `.env.example`, and `compose.yaml`.

### Phase 2: relay packaging

Must-have:

- Package or pin a relay container.
- Generate or mount the relay root key in `/data/relay/root.jwk`.
- Document the relay TLS mode honestly.
- Add compose health or smoke checks that prove the relay port is reachable.

### Phase 3: operational polish

Nice-to-have:

- Local username/password or invite-token bootstrap so OAuth is optional.
- `just selfhost-build`, `just selfhost-up`, and `just selfhost-check`.
- Release images tagged by semver and commit SHA.
- CI that builds the image and runs migrations against a real SQLite file.
- Backup/restore docs with tested commands.

### Phase 4: optional external services

Nice-to-have only after the single-node path works:

- Postgres support for larger communities.
- S3-compatible storage for avatars/assets.
- Separate static-web container or CDN mode.
- Kubernetes manifests.

These should be optional adapters, not the default architecture.

## Risks

- WebTransport over self-hosted reverse proxies is the highest deployment risk.
  Validate the relay/TLS path before polishing anything else.
- The API currently assumes Worker bindings, so pretending Docker is just a
  packaging task would understate the real migration.
- OAuth-only auth is awkward for private self-hosted installs. A local admin or
  invite-token path will reduce support load.
- SQLite is the right default, but migrations need to run predictably and should
  be covered in CI.
- If Cloudflare deploy support remains, keep it as a secondary target with its
  own docs so self-hosted instructions do not inherit Wrangler concepts.

## Decision

Build the self-hosted product around one application container, one MOQ relay
container, and one documented `/data` volume. Keep the product architecture and
MOQ path. Replace D1, R2, Wrangler production serving, and Cloudflare-managed
secrets with local SQLite, filesystem storage, a normal HTTP server, and a
strict environment contract.
