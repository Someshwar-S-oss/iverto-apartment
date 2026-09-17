# Deploying to EC2: Caddy + systemd + rsync

How to run this backend (and a second, independent NestJS app) on one EC2 instance,
fronted by Caddy on 80/443, each app namespaced under its own path prefix
(`API_PREFIX`), deployed by `rsync`-ing the compiled `dist/` build, and supervised by
systemd.

## Architecture

```
                            Internet (443)
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │   Caddy (reverse proxy)   │
                    │   auto TLS via Let's       │
                    │   Encrypt, one domain      │
                    └─────────────┬─────────────┘
                     /gate/*      │      /other/*
                    ┌─────────────┴─────────────┐
                    ▼                             ▼
        127.0.0.1:8031                 127.0.0.1:8032
   ┌─────────────────────────┐   ┌─────────────────────────┐
   │ iverto-gate-backend.svc │   │ iverto-other-backend.svc│
   │ (this repo, NestJS)     │   │ (sibling NestJS app)    │
   │ API_PREFIX=gate         │   │ API_PREFIX=other        │
   └─────────────────────────┘   └─────────────────────────┘
```

Both apps run as plain Node processes on `127.0.0.1`, each on its own port, each
supervised by its own systemd unit. Caddy is the only thing listening on a public
port. Routing between the two apps is decided purely by the URL path prefix — Caddy
does **not** rewrite the path, so each app's `API_PREFIX` must match the Caddy route
that points at it exactly (see [`API_PREFIX`](#api_prefix-how-it-works) below).

Deploys are `rsync` pushes of the locally-built `dist/` folder (+ `package.json`,
`package-lock.json`, `drizzle/`) to the server; `npm ci --omit=dev` runs on the box to
materialize `node_modules`, then systemd restarts the service. No Docker, no CI
runner required on the box itself — this doc assumes you push from your machine or a
CI job with SSH access.

## `API_PREFIX` — how it works

This app reads `API_PREFIX` (see `.env.example`) and, in `src/main.ts`, applies it via
[`app.setGlobalPrefix()`](../../src/main.ts) so every HTTP route is served under
`/<API_PREFIX>/*` instead of `/*`. `src/config/configuration.ts` folds the same prefix
into the Socket.IO path and the M50 terminal WebSocket path (both of those servers sit
outside Nest's HTTP router — see `SharedHttpIoAdapter` — so `setGlobalPrefix` alone
doesn't reach them; the prefix is applied by hand instead). The result: **everything**
this app serves — REST, Swagger, Socket.IO, the M50 raw WS upgrade — lives under one
path prefix, and Caddy just forwards `/gate/*` to this app's port unchanged, no path
rewriting on either side.

`GET /health` is deliberately excluded from the prefix (`exclude: ['health']` in
`main.ts`) so systemd/Caddy always have a fixed, prefix-independent place to poll —
see [Health checks](#health-checks) below.

Set a distinct `API_PREFIX` per app sharing the host, e.g. `gate` for this repo and
`other` for the sibling app. Leave it blank for local dev — routes stay at `/` exactly
as before this feature existed.

> **M50 terminals are physical hardware in the field.** Their WS URL
> (`wss://your-domain/<API_PREFIX>/m50`) is configured on the device/kiosk itself.
> Changing `API_PREFIX` after terminals are provisioned means reconfiguring every
> terminal — treat it as a one-time decision per environment, not something to tweak
> casually post-launch.

## 1. Provision the EC2 instance

- Ubuntu 22.04/24.04 LTS, `t3.small` or larger (two Node processes + Caddy is light,
  but give yourself headroom).
- Security group: inbound `22` (restrict to your IP/VPN), `80` and `443` (open,
  needed for Let's Encrypt + traffic), nothing else. **Do not open 8031/8032** — they
  only need to be reachable from `127.0.0.1` (Caddy on the same box), and Node's
  `app.listen(port)` already binds all interfaces, so the security group is what
  actually keeps them private.
- Point a DNS A record (e.g. `api.iverto.com`) at the instance's Elastic IP — Caddy
  needs this to provision a TLS cert automatically.

## 2. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v20.x
```

Use whatever major version matches your dev environment's `@types/node` range (this
repo targets Node 20+).

## 3. Install Caddy

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

Caddy installs its own systemd unit (`caddy.service`) and starts disabled-until-
configured. Leave it for now — configured in [step 6](#6-configure-caddy).

## 4. Create the service user and directories

One unprivileged system user runs and owns both apps (simplest; split into per-app
users later if you want tighter isolation):

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin iverto
sudo mkdir -p /opt/iverto/gate-backend /opt/iverto/other-backend
sudo chown -R iverto:iverto /opt/iverto
```

You'll SSH in as `iverto` (or a separate `deploy` user in the same situation, added to
a group with write access to `/opt/iverto`) to run the rsync + `npm ci` steps below.

`deploy.sh` ([step 8](#8-first-deploy)) ends with a non-interactive `sudo systemctl
restart` over SSH, so give that user passwordless sudo for exactly those two units —
nothing broader:

```bash
sudo tee /etc/sudoers.d/iverto-deploy >/dev/null <<'EOF'
iverto ALL=(root) NOPASSWD: /usr/bin/systemctl restart iverto-gate-backend, /usr/bin/systemctl status iverto-gate-backend, /usr/bin/systemctl restart iverto-other-backend, /usr/bin/systemctl status iverto-other-backend
EOF
sudo visudo -c   # validate syntax before it takes effect
```

## 5. Environment file per app

`.env` lives **only on the server**, never in the rsync payload — see
[`deploy.sh`](./deploy.sh), which intentionally does not sync it. Create it once per
app and hand-edit it thereafter:

```bash
sudo -u iverto tee /opt/iverto/gate-backend/.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=8031
API_PREFIX=gate
DATABASE_URL=postgres://iverto_app:...@...neon.tech/iverto?sslmode=require
DIRECT_DATABASE_URL=postgres://neondb_owner:...@...neon.tech/iverto?sslmode=require
REDIS_URL=redis://localhost:6379/1
REDIS_KEY_PREFIX=iverto:gate:
JWT_SECRET=<generate a long random value — required, app refuses to boot without it>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
CORS_ORIGINS=https://app.iverto.com,https://admin.iverto.com
M50_WS_PATH=/m50
M50_CLOUD_ID=M50_CLOUD_PROD_01
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
EOF
sudo chmod 600 /opt/iverto/gate-backend/.env
sudo chown iverto:iverto /opt/iverto/gate-backend/.env
```

The sibling app's `.env` mirrors this with `PORT=8032` and `API_PREFIX=other`.

## 6. systemd unit per app

Install [`iverto-gate-backend.service`](./iverto-gate-backend.service):

```bash
sudo cp docs/deployment/iverto-gate-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable iverto-gate-backend
```

Copy the same file for the sibling app (`iverto-other-backend.service`), swapping
`WorkingDirectory`/`EnvironmentFile` to its own directory. Don't start either yet —
there's no `dist/` on the box until the first deploy ([step 8](#8-first-deploy)).

## 7. Configure Caddy

Install [`Caddyfile`](./Caddyfile) to `/etc/caddy/Caddyfile`, adjusting the domain:

```bash
sudo cp docs/deployment/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy   # or `restart` if it wasn't running yet
```

Caddy proxies WebSocket upgrades automatically — no extra config needed for
Socket.IO or the M50 raw WS path, `reverse_proxy` handles the `Upgrade` header
transparently.

## 8. First deploy

From your dev machine (or CI), with SSH access to the box:

```bash
# one-time: point deploy.sh at your instance
export DEPLOY_HOST=iverto@api.iverto.com
export DEPLOY_DIR=/opt/iverto/gate-backend
export DEPLOY_SERVICE=iverto-gate-backend

./docs/deployment/deploy.sh
```

[`deploy.sh`](./deploy.sh) builds `dist/` locally, stages it with `package.json`,
`package-lock.json` and `drizzle/`, rsyncs that to the server, runs
`npm ci --omit=dev` remotely, and restarts the systemd service. Run it again for
every subsequent deploy — `.env` on the server is untouched.

### Database migrations

`drizzle-kit` is a devDependency, deliberately excluded by `npm ci --omit=dev` on the
server — don't try to run migrations on the EC2 box. Neon is reachable from anywhere,
so run migrations from your dev machine or CI, against `DIRECT_DATABASE_URL`, before
or after deploying app code:

```bash
npm run db:migrate
```

## 9. Verify

```bash
curl -s https://api.iverto.com/gate/health
# {"status":"ok","uptime":...}

curl -s https://api.iverto.com/gate/api/docs   # Swagger UI HTML
```

On the box itself:

```bash
sudo systemctl status iverto-gate-backend
sudo journalctl -u iverto-gate-backend -f     # tail app logs (stdout → journald)
sudo journalctl -u caddy -f                    # tail Caddy logs
```

## Adding a third app / changing a prefix

Repeat steps 4–8 with a new port and `API_PREFIX`, add a matching `handle` block to
the Caddyfile, `systemctl reload caddy`. No app needs to know about any other app —
the prefix is the only coupling, and it's fully config-driven (`API_PREFIX` env var),
no code changes required per app instance.

## Rollback

`deploy.sh` doesn't keep old releases by default (it syncs in place). For a quick
rollback, re-run the deploy from a previous git commit/tag locally:

```bash
git checkout <previous-tag>
./docs/deployment/deploy.sh
git checkout master
```

If you want proper release history on the box (timestamped dirs + a `current`
symlink, so rollback doesn't depend on your local git state), that's a reasonable
follow-up once this simpler flow feels limiting — flag it and we can add it.

## Security checklist

- [ ] Security group: only `22` (restricted), `80`, `443` open.
- [ ] `.env` files are `chmod 600`, owned by the service user, never rsynced from a
      dev machine, never committed.
- [ ] `JWT_SECRET` is a long random value distinct from the dev default — the app
      refuses to boot in `NODE_ENV=production` without one set (see
      `src/config/configuration.ts`).
- [ ] `CORS_ORIGINS` is a real allowlist in production, not left as `*`.
- [ ] systemd units run as the unprivileged `iverto` user, not root.
- [ ] SSH key used for deploys is scoped to this box only.
