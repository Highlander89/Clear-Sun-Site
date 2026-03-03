# ClearSun Runbook

## Services
- Dashboard: PM2 process `clearsun-dashboard` (Next.js) on port 3002
- WA worker: PM2 process `clearsun-wa`

## Deploy
```bash
cd /home/ubuntu/clearsun-repo
bash ops/deploy.sh
```

## Healthcheck
```bash
bash ops/healthcheck.sh
```

## Rollback
```bash
git tag --sort=-creatordate | head
bash ops/rollback.sh prod-YYYY-MM-DD-HHMM
```

## Logs
```bash
pm2 logs clearsun-dashboard --lines 200
pm2 logs clearsun-wa --lines 200
```
