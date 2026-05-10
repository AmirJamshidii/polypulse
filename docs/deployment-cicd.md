# CI/CD Deployment (GitHub Actions + SSH)

This project auto-deploys on every push to `main`.

## 1) Prepare the server

- Install Docker Engine and Docker Compose plugin.
- Clone this repository on the server.
- Create `.env` in repo root (same location as `docker-compose.yml`).
- Make sure port mapping in `docker-compose.yml` is valid for your server.

## 2) Configure GitHub Secrets

In `Settings` -> `Secrets and variables` -> `Actions`, add:

- `SERVER_HOST` (server IP/domain)
- `SERVER_USERNAME` (SSH user)
- `SERVER_SSH_KEY` (private key content)
- `SERVER_APP_DIR` (optional, default: `/var/www/polypulse`)

Also set in server `.env`:
- `TELEGRAM_BOT_TOKEN`
- `ALLOWED_TELEGRAM_USER_IDS` (comma-separated Telegram IDs)

## 3) Workflow behavior

Workflow file: `.github/workflows/deploy.yml`

On each push to `main`:
- `test` job runs on GitHub-hosted runner:
  - `npm ci`
  - `npm run lint`
  - `npm run build`
  - `npm test`
- If tests pass, `cd` runs over SSH:
  - `cd $SERVER_APP_DIR` (or `/var/www/polypulse`)
  - `git pull origin main`
  - `docker compose up -d --build`
  - `docker compose ps`
  - health check on `http://127.0.0.1:${PORT:-3000}/health`

## 4) Required server tools

SSH user must be able to run:
- `docker compose`
- `curl`

## 5) First deploy check

After first push to `main`, verify:
- Actions tab -> workflow passed
- On server: `docker compose ps` shows `app` as running
- App port responds
