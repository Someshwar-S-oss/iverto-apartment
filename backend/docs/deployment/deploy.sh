#!/usr/bin/env bash
# Build locally, rsync dist/ (+ package files + drizzle/) to the EC2 box, install
# production deps remotely, restart the systemd service. See
# docs/deployment/ec2-caddy-systemd.md for the full setup this script assumes.
#
# Usage:
#   DEPLOY_HOST=iverto@api.iverto.com \
#   DEPLOY_DIR=/opt/iverto/gate-backend \
#   DEPLOY_SERVICE=iverto-gate-backend \
#   ./docs/deployment/deploy.sh
#
# Run from the repo root (or anywhere — it cd's to the repo root itself below).

set -euo pipefail

: "${DEPLOY_HOST:?Set DEPLOY_HOST, e.g. iverto@api.iverto.com}"
: "${DEPLOY_DIR:?Set DEPLOY_DIR, e.g. /opt/iverto/gate-backend}"
: "${DEPLOY_SERVICE:?Set DEPLOY_SERVICE, e.g. iverto-gate-backend}"
SSH_KEY="${DEPLOY_SSH_KEY:-}"       # optional: path to a private key
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "$SSH_KEY" ] && SSH_OPTS+=(-i "$SSH_KEY")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> Installing deps & building"
npm ci
npm run build

echo "==> Staging release payload"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -r dist "$STAGE/dist"
cp package.json package-lock.json "$STAGE/"
cp -r drizzle "$STAGE/drizzle"
# .env is intentionally NOT included — it lives only on the server (see step 5 of the
# deployment guide) so secrets never pass through a laptop, CI log, or this rsync payload.

echo "==> Syncing to $DEPLOY_HOST:$DEPLOY_DIR"
rsync -avz --delete \
  --exclude ".env" \
  -e "ssh ${SSH_OPTS[*]}" \
  "$STAGE/" "$DEPLOY_HOST:$DEPLOY_DIR/"

echo "==> Installing production deps & restarting $DEPLOY_SERVICE"
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" bash -s -- "$DEPLOY_DIR" "$DEPLOY_SERVICE" <<'REMOTE'
set -euo pipefail
cd "$1"
npm ci --omit=dev
sudo systemctl restart "$2"
sudo systemctl --no-pager status "$2"
REMOTE

echo "==> Done"
