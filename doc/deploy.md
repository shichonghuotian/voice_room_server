# Server Deployment Guide

This guide matches the current test deployment on the server:

- Repository path: `/root/voice_room_server`
- PM2 process name: `voice-room`
- Boot service: `pm2-root.service`
- App port: `3000`
- Runtime mode: `dev:sqlite`
- Reverse proxy: Nginx on `weu-api.shichonghuo.online`

## One-Time Setup

The server is already configured, but these are the key pieces:

```bash
cd /root/voice_room_server
npm run seed
pm2 start npm --name voice-room --cwd /root/voice_room_server -- run dev:sqlite
pm2 save
systemctl enable --now pm2-root.service
```

## Update From GitHub

Use this when you pull a new version of the repo from GitHub:

```bash
cd /root/voice_room_server
git status
git pull origin main
```

If the pull changes dependencies, reinstall them:

```bash
npm install
```

If you changed seed data or want to refresh test data, rerun:

```bash
npm run seed
```

## Restart The Service

For normal code updates, restart the PM2 process:

```bash
pm2 restart voice-room --update-env
pm2 status
```

If PM2 itself needs to be reloaded from boot state:

```bash
systemctl restart pm2-root.service
```

## Verify Health

Check the local app first:

```bash
curl http://127.0.0.1:3000/health
```

Then check the public URL:

```bash
curl https://weu-api.shichonghuo.online/health
```

Expected response:

```json
{"status":"ok","db":"sqlite",...}
```

## Nginx

If you change the Nginx config, validate and reload it:

```bash
nginx -t
systemctl reload nginx
```

Current site config:

- `/etc/nginx/sites-available/weu-api`
- `/etc/nginx/sites-enabled/weu-api`

## Troubleshooting

- If `pm2 restart` fails, check logs:

```bash
pm2 logs voice-room --lines 100
```

- If the app does not start after a Node upgrade, rebuild native modules:

```bash
npm rebuild better-sqlite3 --build-from-source
```

- If HTTPS returns a Cloudflare `522`, verify the server firewall allows `443/tcp`.

