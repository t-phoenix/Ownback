# ownback.tech: the marketing site

The scroll film, the waitlist, the Launch-app gate and a hidden admin desk. It is separate from the app (`frontend/`) and deploys as its own Vercel project.

- **Static page** in `public/`: plain HTML, CSS and JS. No build step. Three.js r128 loads from cdnjs.
- **Three API functions** in `api/` (Vercel Node functions) backed by Postgres (Neon):
  - `POST /api/join`: adds someone to the waitlist.
  - `POST /api/access`: the Launch-app gate. Only approved emails get the app URL.
  - `/api/admin`: the admin desk (sign in, list, approve/revoke, let someone in directly, remove, CSV export).
- **Admin desk** at `/admin`. It isn't linked anywhere, it sends `noindex`, and it's protected by `ADMIN_PASSWORD`.

The gate is on the website only (decision, 12 Nov 2026). Someone who knows the app's address can still open it.

## Run it locally

```bash
cd site && pnpm install && pnpm dev
```

This opens http://localhost:4321. Without `DATABASE_URL`, the waitlist lives in memory and the admin password is `dev-password`.

```bash
cd site && pnpm test
```

## Env (Vercel → Project → Settings → Environment Variables)

| Name | What |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (the pooled one). The tables `site_waitlist` and `site_rate` are created on first use. Your existing Ownback Neon database is fine: the `site_` prefix keeps them apart. |
| `ADMIN_PASSWORD` | Password for `/admin`. At least 10 characters. |
| `ADMIN_SECRET` | At least 32 random characters, used to sign the admin cookie. Generate one with `openssl rand -base64 48`. |
| `APP_URL` | Where approved people go. `https://app.ownback.tech` once that domain is live; until then, the app's current Vercel URL. |

## Deploy

1. In Vercel: **Add New → Project →** import the `t-phoenix/Ownback` repo.
2. Set **Root Directory** to `site`. Leave Framework Preset as **Other**, with no build command. `vercel.json` serves `public/` and the `api/` functions.
3. Add the four env vars above, then **Deploy**.
4. Under **Settings → Domains**, add `ownback.tech` and `www.ownback.tech` (redirect `www` to the bare domain). At your domain registrar, add the DNS records Vercel shows: an `A` record for `@` and a `CNAME` for `www`.

## Move the app to app.ownback.tech

1. In the **frontend** Vercel project: **Settings → Domains →** add `app.ownback.tech`, then add the `CNAME app → …` record Vercel shows at your registrar.
2. Set `NEXT_PUBLIC_SITE_URL=https://app.ownback.tech` on the frontend project and redeploy.
3. On the API (Render): add `https://app.ownback.tech` to `CORS_ORIGIN` (comma-separated), or the app's API calls will fail.
4. In Privy: add `https://app.ownback.tech` to the allowed domains. If you use Google OAuth for Gmail, add its redirect URIs on that domain too.
5. Set `APP_URL=https://app.ownback.tech` on the site project.

## Files

`public/js/film.js` is the scroll film. Each beat is one row in the `S` list (name, length, what to draw). `RECT` holds the spots in each still the camera zooms through. `coin.js` is the hero coin, `split3d.js` the phone cut into companies, `scratch.js` the scratch cards, `app.js` the waitlist and gate, and `admin.js` the desk. The film stills are in `public/img/` (originals in `business/website-stills/`).
