# Pari Cab Service Business Website

Business-ready customer booking website and admin dashboard for Pari Cab Service.

## Requirements
- Node.js 18 or newer
- npm

This version does **not** use `better-sqlite3`, so it does not require Visual Studio, C++ build tools, or native SQLite compilation.

## Run locally

```powershell
npm install
npm start
```

Open:
- Customer website: http://localhost:3000
- Admin dashboard: http://localhost:3000/admin
- Health check: http://localhost:3000/api/health

## Admin login

Default local credentials:
- Username: `admin`
- Password: `change-this-password`

For real business use, create a `.env` file and set:

```env
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-password
```

## Booking storage

Bookings are stored in `data/bookings.json`. The server creates this file automatically on first run. Keep the `data` folder backed up in production.

## Production note

For a larger multi-user deployment, move booking storage to a hosted database such as PostgreSQL/MySQL/Supabase. The current JSON storage is intended for the first functional business version and small-volume use.
