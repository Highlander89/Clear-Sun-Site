# Clearsun Runbook

## Services
- Dashboard: http://<server>:3002 (PM2: clearsun-dashboard)
- WhatsApp bot: PM2: clearsun-wa

## Deploy
```bash
bash ops/deploy.sh
```

## Healthcheck
```bash
bash ops/healthcheck.sh
```

## Rollback
```bash
bash ops/rollback.sh prod-YYYY-MM-DD-HHMM
```

## Secrets
- Do NOT commit secrets.
- Bot uses `/home/ubuntu/clearsun-wa/.env` today. In the consolidated repo, prefer a server-local `.env` outside git.
