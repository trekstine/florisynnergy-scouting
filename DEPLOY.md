# Deploying FloriSynergy Scouting to a single EC2 instance

The whole stack runs as four containers on one box:

```
Internet ──▶ Caddy (:80/:443, auto-TLS) ──▶ web (Next.js :3000) ──▶ api (FastAPI :8000) ──▶ db (Postgres/PostGIS :5432)
                                                        (only Caddy is public — api & db stay internal)
```

Because the browser talks to the API only through the Next.js server-side proxy, you expose **one** public port set (443). The API and database never leave the instance's private Docker network.

## 1. Launch the instance

- **AMI:** Ubuntu 24.04 LTS.
- **Type:** `t3.medium` (4 GB) recommended — the Next.js build is memory-hungry and can OOM on `t3.small` (2 GB). If you must use `t3.small`, add swap (see step 6) or build the images in CI and pull them.
- **Storage:** 20 GB+ gp3.
- **Elastic IP:** allocate and associate one (so the address is stable for DNS).
- **Security group inbound:**
  | Port | Source | Why |
  |------|--------|-----|
  | 22   | *your IP only* | SSH |
  | 80   | 0.0.0.0/0 | HTTP → Caddy (ACME + redirect) |
  | 443  | 0.0.0.0/0 | HTTPS → Caddy |
  Do **not** open 8000 or 5432.

## 2. DNS

Point an A record (e.g. `scouting.yourfarm.com`) at the Elastic IP. Caddy needs this resolving **before** first start so it can obtain a TLS cert.

## 3. Install Docker

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Get the code + configure

```bash
git clone <your-repo-url> florisynergy && cd florisynergy
cp .env.prod.example .env
# edit .env: set DOMAIN, and strong POSTGRES_PASSWORD + SECRET_KEY (openssl rand -hex 32)
nano .env
```

## 5. Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f caddy   # watch the cert get issued
```

Visit `https://<your-domain>`. Sign in with the seeded admin (`web-admin` / `0000`) — **change or remove the seed for real use** (`SEED_ON_STARTUP=false` in `.env`, then recreate the DB).

## 6. (small instances only) add swap for the build

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Operating it

- **Update:** `git pull && docker compose -f docker-compose.prod.yml up -d --build`
- **Backups:** the DB lives in the `pgdata` volume. Dump regularly:
  `docker compose -f docker-compose.prod.yml exec db pg_dump -U flori flori_scouting | gzip > backup-$(date +%F).sql.gz`
  and/or take EBS snapshots.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f api web`

## Notes / trade-offs

- **Single instance** = simple but no HA. For resilience later: move Postgres to RDS (with the PostGIS extension), run web/api on ECS/Fargate behind an ALB, and keep secrets in SSM Parameter Store / Secrets Manager.
- `SECRET_KEY` signs the JWTs — rotating it logs everyone out.
- Managed TLS alternative: put an ALB + ACM cert in front instead of Caddy, and drop the caddy service.
