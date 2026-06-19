# CRM Movilbro – Production Deployment

## Requirements

- **Node.js** >= 16.x (tested with 18.x, 20.x)
- **SQLite** (bundled via `better-sqlite3`, no separate install needed)
- **Windows** Server or VM (the app is developed and tested on Windows)

## Configuration (Environment Variables)

| Variable     | Default | Description                          |
| ------------ | ------- | ------------------------------------ |
| `PORT`       | `3000`  | HTTP port the server listens on      |
| `NODE_ENV`   | —       | Set to `production` to disable debug |

All per-client credentials (API URL, email, password, brand ID) are stored in the SQLite database under the `settings` table. Use the CRM web UI or direct SQL to configure:

```sql
INSERT OR REPLACE INTO settings (key, value) VALUES ('likes_api_url', 'https://api.likestelecom.com');
INSERT OR REPLACE INTO settings (key, value) VALUES ('likes_client_id', 'your-email@example.com');
INSERT OR REPLACE INTO settings (key, value) VALUES ('likes_client_secret', 'your-password');
INSERT OR REPLACE INTO settings (key, value) VALUES ('likes_brand_id', 'your-brand-id');
```

## Starting for Production

### Using the startup script

```powershell
.\start-production.ps1            # defaults to port 3001
.\start-production.ps1 -Port 5000 # custom port
```

The script will:
- Set `NODE_ENV=production` and `PORT=3001` (default)
- Start `node server.js` in the same window
- Log all health-check activity to `server-production.log`
- Poll `/health` every 30 seconds
- Auto-restart the server if it crashes

### Using PM2 (alternative)

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

## Monitoring

- **Health endpoint:** `GET /health` returns `{ status: 'ok', uptime, timestamp }`
- **Log file:** `server-production.log` in the project root (written by `start-production.ps1`)
- **PM2:** `pm2 logs`, `pm2 status`, `pm2 monit`

## Backup

The entire application state lives in a single SQLite file:

```
movilbro.db
movilbro.db-wal
movilbro.db-shm
```

To back up, stop the server and copy these three files. To restore, replace them and restart.

```powershell
# Example backup
Copy-Item movilbro.db "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').db"
```

## Graceful Degradation (Likes API Failure)

If the Likes Telecom API is unreachable or returns errors, the CRM does **not** crash. Each module handles failure independently:

| Route             | Behavior on API failure                                  |
| ----------------- | -------------------------------------------------------- |
| Stats / KPIs      | Falls back to locally-entered subscriptions only         |
| Subscriptions     | Shows local DB subs, skips API data, flags `apiError`    |
| Customers         | Returns empty customer list from API                     |
| Portabilities     | Returns empty list                                       |
| Tickets           | Returns empty list                                       |
| Products          | Returns empty list                                       |

All API calls are wrapped in try/catch and cached with a 60-second TTL. If an API call fails, the stale cached data is served (if available). If no cache exists, an empty array is used. The application continues serving all UI pages and local CRUD operations normally.
