# ownback.tech: the marketing site

The scroll film, an updates sign-up, Launch-app links to the app, and a hidden admin desk. It is separate from the app (`frontend/`) and deploys as its own Vercel project.

- **Static page** in `public/`: plain HTML, CSS and JS. No build step. Three.js r128 loads from cdnjs.
- **Three API functions** in `api/` (Vercel Node functions) backed by Postgres (Neon):
  - `POST /api/join`: saves an email for updates (with the optional "what would you own" answer).
  - `POST /api/access`: the approved-email check for the gate. Closed (404) unless `GATED=1`.
  - `/api/admin`: the admin desk (sign in, list, remove, CSV export; approve/revoke and let-in only while gated).
- **Admin desk** at `/admin`. It isn't linked anywhere, it sends `noindex`, and it's protected by `ADMIN_PASSWORD`.

**Launch settings live in one file, [`public/js/config.js`](public/js/config.js):** the app URL, whether the gate is on, and the free-spot offer.

- **Now (15 Nov 2026):** the gate is off. Every "Launch app" goes straight to `https://app.ownback.tech`, and the site says the app is free for the first 1,000 people. The form is an updates sign-up; emails still land in `/admin`.
- **To bring the waitlist back:** set `gated: true` in `config.js` and `GATED=1` in Vercel, then redeploy. Launch app then asks for an approved email, and `/admin` shows approve/revoke again.
- The free-for-1,000 offer is copy only. Counting the 1,000 and waiving fees for them happens in the app, not here.

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
| `GATED` | `1` only while the waitlist gate is on. Leave it unset now. |
| `APP_URL` | Only used while gated: where approved people go. `https://app.ownback.tech` once that domain is live; until then, the app's current Vercel URL. |

## Deploy

1. In Vercel: **Add New → Project →** import the `t-phoenix/Ownback` repo.
2. Set **Root Directory** to `site`. Leave Framework Preset as **Other**, with no build command. `vercel.json` serves `public/` and the `api/` functions.
3. Add the four env vars above, then **Deploy**.
4. Under **Settings → Domains**, add `ownback.tech` and `www.ownback.tech` (redirect `www` to the bare domain). At your domain registrar, add the DNS records Vercel shows: an `A` record for `@` and a `CNAME` for `www`.

## Move the app to app.ownback.tech

The app lives at `https://frontend-beige-delta-bppn1t6ufd.vercel.app` today. Follow these steps in order. Keep the old URL working until the last step checks out.

**What changes, and where:**

| # | Where | What to set | Why |
|---|---|---|---|
| 1 | Registrar DNS | `CNAME app → <value Vercel shows>` | Points the subdomain at Vercel |
| 2 | Vercel · frontend project · Domains | add `app.ownback.tech` | Serves the app there and issues the SSL certificate |
| 3 | Vercel · frontend project · Env | `NEXT_PUBLIC_SITE_URL=https://app.ownback.tech` | Canonical URL, sitemap, share cards. Baked in at build time, so you must redeploy |
| 4 | Render · API · Environment | `CORS_ORIGIN=https://app.ownback.tech,https://frontend-beige-delta-bppn1t6ufd.vercel.app` | Lets the new origin call the API |
| 5 | Privy dashboard | allowed origin `https://app.ownback.tech` | Without it, Google sign-in and wallets fail on the new domain |
| 6 | Google Cloud Console | origins and redirect URIs on the new domain | Only if Privy uses your own Google OAuth client, or Gmail import is on |
| 7 | Vercel · site project · Env | `APP_URL=https://app.ownback.tech` | Where the Launch-app gate sends approved people |
| 8 | Repo | `.github/workflows/keep-api-awake.yml` ping URL | Keeps Render awake through the new domain |
| 9 | Outside the code | X, YouTube, GitHub, ETHGlobal, deck, Search Console | Public links |

Not affected: `NEXT_PUBLIC_API_URL` (it points at Render, not the app), `DATABASE_URL`, and the site's own `ownback.tech`.

### Step by step

1. **DNS (your domain registrar, where you bought ownback.tech)**
   Do step 2 first: Vercel shows the exact record to add. Then go to **DNS / Manage DNS → Add record**: Type `CNAME`, Name/Host `app`, Value the target Vercel shows (usually `cname.vercel-dns.com`), TTL automatic. Save. Leave the existing `@` and `www` records alone; they serve the marketing site.

2. **Vercel: add the domain to the app**
   [vercel.com](https://vercel.com) → the **frontend** project (not the site project) → **Settings → Domains → Add Domain** → `app.ownback.tech` → **Add**. Pick "Connect to Production". Wait until it shows **Valid Configuration** and the SSL certificate is issued (a few minutes after DNS propagates).

3. **Vercel: set the app's own URL**
   Same project → **Settings → Environment Variables** → add or edit `NEXT_PUBLIC_SITE_URL` = `https://app.ownback.tech` for **Production** → Save. Then **Deployments** → the latest production deployment → **⋯ → Redeploy**. You must redeploy because `NEXT_PUBLIC_*` values are baked in at build time.

4. **Render: allow the new origin**
   [dashboard.render.com](https://dashboard.render.com) → the API service → **Environment** → `CORS_ORIGIN` → set it to both origins, comma-separated with no spaces: `https://app.ownback.tech,https://frontend-beige-delta-bppn1t6ufd.vercel.app` → **Save Changes** (Render redeploys). Afterwards, check that `https://app.ownback.tech/api/health` shows the latest commit (see the deploy-split note: Render does not always auto-deploy).

5. **Privy: allow the new origin**
   [dashboard.privy.io](https://dashboard.privy.io) → the Ownback app → **Configuration → App settings → Domains** (Allowed origins) → add `https://app.ownback.tech`. Keep the old Vercel URL listed until the move is done. If your Privy plan shows only one allowed origin, swap it at the end, after step 10.

6. **Google Cloud (only if it applies)**
   [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials** → your OAuth 2.0 client:
   - If Privy uses **your own** Google client (Privy → Login methods → Google → custom credentials), add `https://app.ownback.tech` under **Authorized JavaScript origins**. Keep Privy's redirect URI as it is.
   - If Gmail import is turned on (`GMAIL_ENABLED`), add `https://app.ownback.tech/api/gmail/callback` under **Authorized redirect URIs**.
   - **OAuth consent screen → Authorized domains:** add `ownback.tech`.
   If Privy uses its default Google login and Gmail is off, skip this step.

7. **Vercel: point the website's gate at the new app**
   The **site** project → **Settings → Environment Variables** → `APP_URL` = `https://app.ownback.tech` → Save → **Deployments → ⋯ → Redeploy**.

8. **Repo: keep-awake ping**
   In `.github/workflows/keep-api-awake.yml`, change the URL to `https://app.ownback.tech/api/health`, then commit and push. Do this only after step 2 shows Valid.

9. **Public links (no code)**
   - X: bio website and the pinned thread
   - YouTube: Customization → Profile → Links, plus both video descriptions
   - GitHub: repo → ⚙ next to **About** → Website
   - ETHGlobal project page, the pitch deck, and any README links
   - [Google Search Console](https://search.google.com/search-console): add a **Domain** property for `ownback.tech` (it covers `app.` too) by adding the TXT record at your registrar. Then submit `https://ownback.tech/sitemap.xml` if the site has one, and `https://app.ownback.tech/sitemap.xml`.

10. **Check it end to end** (in a private window)
    - `https://app.ownback.tech` loads with a padlock, and the page's share preview shows `app.ownback.tech`.
    - `https://app.ownback.tech/api/health` returns `ok: true` with the latest commit.
    - Sign in with Google works, and Home shows the same wallet addresses as on the old URL.
    - On `https://ownback.tech`, an approved email's Launch app opens `app.ownback.tech`.

11. **Then retire the old URL (optional, later)**
    Remove it from Privy and `CORS_ORIGIN`. Don't delete the `.vercel.app` domain; Vercel needs it.

**Users will notice two things.** Sessions are per-domain, so everyone signs in once more on the new URL. Anyone who installed the PWA from the old URL needs to reinstall it from `app.ownback.tech`.

## Files

`public/js/film.js` is the scroll film. Each beat is one row in the `S` list (name, length, what to draw). `RECT` holds the spots in each still the camera zooms through. `coin.js` is the hero coin, `split3d.js` the phone cut into companies, `scratch.js` the scratch cards, `app.js` the waitlist and gate, and `admin.js` the desk. The film stills are in `public/img/` (originals in `business/website-stills/`).
