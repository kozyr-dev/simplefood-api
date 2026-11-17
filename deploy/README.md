# Production deployment

The VPS runs Postgres and the API with Docker Compose in `/opt/simplefood-api`. nginx (Hestia) proxies `api-simplefood.kozyr.info` to `127.0.0.1:1339`. CI publishes the image to GHCR, and the `deploy` job in [ci.yml](../.github/workflows/ci.yml) runs [deploy.sh](deploy.sh) on the VPS for every push to `main`.

| File                         | Where                    | What                                                                                           |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| [compose.yaml](compose.yaml) | git → VPS (CI copies it) | Postgres, the API, and the one-off `migrate`                                                   |
| [deploy.sh](deploy.sh)       | git → VPS (CI copies it) | pull, migrate, replace the API, wait for healthy (back to the previous image if it isn't)      |
| `.env`                       | VPS only (`chmod 600`)   | for Compose: `POSTGRES_PASSWORD`, `API_IMAGE` (written by deploy.sh). [Template](.env.example) |
| `api.env`                    | VPS only (`chmod 600`)   | the API's settings. [Template](api.env.example)                                                |

## One-time setup

On the VPS, as root:

```bash
install -d -m 700 /opt/simplefood-api && cd /opt/simplefood-api
# compose.yaml, deploy.sh, .env.example and api.env.example from this folder:
#   scp deploy/{compose.yaml,deploy.sh,.env.example,api.env.example} root@<vps>:/opt/simplefood-api/
mv .env.example .env && mv api.env.example api.env && chmod 600 .env api.env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 32)|" .env
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 48)|" api.env
nano api.env    # SMTP_USER, SMTP_PASSWORD (Mailgun), MAIL_NOTIFY_TO
```

Then, in the GitHub repository's settings:

- **Secrets** (Settings → Secrets and variables → Actions):
  - `VPS_HOST`: `72.61.180.80`
  - `VPS_USER`: `root`
  - `VPS_SSH_KEY`: a private key whose public half is in root's `~/.ssh/authorized_keys` (the website's deploy key works)
  - `VPS_KNOWN_HOSTS`: the server's host key, so the job talks to this server only. Take the output of `ssh-keyscan -t ed25519 72.61.180.80` and check its fingerprint against `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VPS.
- **Variable** `DEPLOY_ENABLED` = `true`: the deploy job is skipped until it is set.

The job logs in to GHCR on the VPS with its own short-lived token for each pull, so the VPS keeps no registry password, even for a private image.

## Everyday commands

In `/opt/simplefood-api`:

```bash
docker compose ps                                  # status and health
docker compose logs -f --tail 100 api              # the API's JSON logs
./deploy.sh ghcr.io/<owner>/simplefood-api:<sha>   # deploy, or go back to, a version
docker compose run --rm migrate                    # apply migrations (deploy.sh does it)
docker compose run --rm -it api node dist/users/cli/create-admin.js --email <email> --name <name>
docker compose exec postgres psql -U simplefood    # the database
```

- **Migrations run before the new API starts.** The old API keeps running against the migrated database for a few seconds, so a migration must not break it: add things first, remove them in a later release.
- **Data** lives in the volumes `simplefood-api_postgres-data` and `simplefood-api_uploads`. `docker compose down` keeps them; `down -v` deletes them.
- **Restarts:** both services have `restart: unless-stopped`, so they come back after a reboot or crash.
