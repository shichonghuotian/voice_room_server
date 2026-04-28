# Deploy Cheatsheet

## Update Code

```bash
cd /root/voice_room_server
git pull origin main
npm install
npm run seed
```

## Restart Service

```bash
pm2 restart voice-room --update-env
pm2 status
```

## Check Health

```bash
curl http://127.0.0.1:3000/health
curl https://weu-api.shichonghuo.online/health
```

## Reload Nginx

```bash
nginx -t
systemctl reload nginx
```

## Full Service Recovery

If the server rebooted and PM2 did not restore the app:

```bash
systemctl restart pm2-root.service
pm2 status
```

