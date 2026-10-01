# ☄️ Stremio IPTV Addon (Direct M3U • Xtream Codes • XMLTV EPG • Series Support)

> A self‑hostable, token‑based, privacy‑friendly IPTV addon for **Stremio** supporting:
> - Direct M3U playlists (TV + Movie + heuristic Series detection)
> - Xtream Codes API (JSON mode + m3u_plus mode)
> - Panel XMLTV or custom EPG feeds
> - Channel Logos, Live Now info, Upcoming programme snippets
> - Timezone-aware guide times (DST handled automatically)
> - Movies & VOD catalog
> - Series catalog (Xtream native + M3U heuristic grouping)
> - Live TV only mode (drops movie & series catalogs)
> - Per-group channel catalogs with keyword filter
> - Reconfigure from Stremio's Configure button (settings pre-filled)
> - Client pre‑flight validation with CORS bypass fallback
> - Config tokens, encrypted automatically when `CONFIG_SECRET` is set
> - Local LRU + Redis caching
> - Streaming XMLTV parser (fits 512 MB hosts) & logo proxy
> - Graceful degradation (EPG failures do not block usage)

---

## 🎬 Demo Flow (How Users Install)

1. Visit your hosted base URL (`https://your-host/`)
2. Pick a mode:
   - “Direct M3U / EPG” → paste playlist + optional XMLTV
   - “Xtream Codes API” → enter panel URL + credentials (or toggle m3u_plus)
3. (Optional) Provide or override EPG source
4. Pre‑flight runs:
   - Fetch + parse playlist (client; server fallback if CORS)
   - Fetch + quick-scan EPG (non-fatal)
   - Build a configuration token
5. A Stremio manifest URL appears (disabled buttons enable when ready):
   ```
   https://your-host/<TOKEN>/manifest.json
   stremio://your-host/<TOKEN>/manifest.json
   ```
6. Open in Stremio → catalogs appear:
   - IPTV Channels (tv)
   - IPTV Movies (movie) and IPTV Series (series), unless **Live TV only** is on
   - One row per channel group, if **Show each channel group as its own row** is on
7. To change settings later, click **Configure** on the addon in Stremio, then reinstall with the new link.

---

## 🧪 Quick Start (Local Dev)

```bash
git clone https://github.com/namillis/M3U-XCAPI-EPG-IPTV-Stremio.git
cd M3U-XCAPI-EPG-IPTV-Stremio
cp .env.example .env   # create your env (or export vars manually)
npm install
npm start
# Server runs on PORT (default 7000)
open http://localhost:7000/
```

Minimal `.env`:
```env
PORT=7000
CACHE_ENABLED=true
CACHE_TTL_MS=21600000
MAX_CACHE_ENTRIES=300
DEBUG_MODE=true
# Optional:
# REDIS_URL=redis://localhost:6379
# CONFIG_SECRET=super-long-random-string   (enables /encrypt)
# PREFETCH_ENABLED=true
# PREFETCH_MAX_BYTES=5000000
```

---

## 🐳 Docker (Standalone)

```bash
docker build -t stremio-iptv-addon .
docker run -d \
  -e PORT=7000 \
  -e DEBUG_MODE=false \
  -e CACHE_ENABLED=true \
  -p 7000:7000 \
  --name stremio-addon \
  stremio-iptv-addon
```

### Docker Compose (with Redis for shared cache)

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
  addon:
    build: .
    restart: unless-stopped
    environment:
      PORT: 7000
      REDIS_URL: redis://redis:6379
      CACHE_ENABLED: "true"
      CACHE_TTL_MS: 21600000
      MAX_CACHE_ENTRIES: 400
      PREFETCH_ENABLED: "true"
      PREFETCH_MAX_BYTES: 6000000
      CONFIG_SECRET: "generate_a_long_random_string"
      DEBUG_MODE: "false"
    depends_on:
      - redis
    ports:
      - "7000:7000"
```

Then open: `http://localhost:7000/`

---

## ☁️ Free Hosting on Render

[Render](https://render.com)'s free web service tier runs this addon at no cost and without a credit card. You get an `https://<name>.onrender.com` URL with HTTPS included, which Stremio requires for remote addons.

### Deploy

1. Fork this repo on GitHub.
2. Sign up at [render.com](https://render.com) with your GitHub account.
3. Click **New +** → **Web Service** and pick your fork.
4. Use these settings:

   | Setting | Value |
   |---------|-------|
   | Runtime | `Node` |
   | Branch | `main` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | `Free` |
   | Health Check Path | `/health` (under **Advanced**) |

5. Under **Advanced**, add environment variables:

   | Variable | Value |
   |----------|-------|
   | `CONFIG_SECRET` | A long random string, e.g. from `openssl rand -hex 32`. Encrypts your credentials in the manifest URL. |
   | `DEBUG_MODE` | `false` |
   | `CACHE_ENABLED` | `true` |
   | `PREFETCH_ENABLED` | `true` |

   Don't set `PORT`. Render injects its own, and the server reads `process.env.PORT`.

6. Click **Create Web Service**. When the logs show it's live, open `https://<name>.onrender.com/`, configure your source, and install the addon in Stremio.

Render redeploys automatically whenever you push to your fork. To pull in upstream changes, use **Sync fork** on GitHub.

### Keeping it awake (UptimeRobot or cron-job.org)

A free Render service spins down after 15 minutes without incoming HTTP requests. The next request waits about a minute for it to start again, so Stremio shows empty or slow catalogs at first. Each spin-down also clears the in-memory cache, so the channel list and EPG are downloaded again from your provider on every wake.

To prevent this, have a free external service request `/health` more often than every 15 minutes. `/health` returns a small JSON body and never contacts your IPTV provider, so the pings add no load there. Set up one of these (you only need one):

**UptimeRobot** (recommended): free plan with 50 monitors, 5-minute checks, and an email alert if the addon goes down.
1. Sign up at [uptimerobot.com](https://uptimerobot.com).
2. Click **New monitor** and choose **HTTP(s)**.
3. URL: `https://<name>.onrender.com/health`
4. Interval: 5 minutes.

**cron-job.org**: free and can run as often as every minute, but has no real alerting.
1. Sign up at [cron-job.org](https://cron-job.org) and create a cronjob.
2. URL: `https://<name>.onrender.com/health`
3. Schedule: every 10 minutes.

cron-job.org gives up on a request after 30 seconds. If a ping lands while the service is still waking, that run shows as failed. This is harmless, and the next run succeeds.

### Render free tier notes

- **Instance hours:** Render gives 750 free hours per workspace per month, shared by all free services. A month has 720-744 hours, so one service kept awake uses almost the whole pool. Keep only one free service awake, or they'll all be suspended until the next month.
- **Don't ping `/robots.txt`:** while the service is asleep, Render answers that path itself. The check passes but the service never wakes.
- **512 MB RAM:** very large playlists or EPGs can still run out of memory. If Render reports "Ran out of memory", enable **Live TV only** or use a smaller custom EPG.
- **Datacenter IP blocks:** some IPTV providers block cloud IPs. If the config page can't load your playlist on Render but it loads at home, that's the likely cause, and every cloud host will behave the same way.
- **Occasional cold starts:** deploys and Render's own restarts of free instances still cause a cold start now and then, even with a keep-alive.

---

## 🔐 Configuration Tokens

| Type | Format | Notes |
|------|--------|-------|
| Plain Token | Base64URL JSON (no prefix) | Used by the config UI when `CONFIG_SECRET` is not set |
| Encrypted Token | `enc:<base64url ciphertext>` | Used automatically by the config UI when `CONFIG_SECRET` (16+ chars) is set |
| Manifest URL | `https://host/<TOKEN>/manifest.json` | Supply to Stremio |
| Stremio Protocol | `stremio://host/<TOKEN>/manifest.json` | Auto-open from UI |

Decryption / parsing is done server-side before addon build. Changing `CONFIG_SECRET` invalidates every encrypted install link, so set it once and leave it.

---

## 📡 HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Landing + mode selection |
| `/configure-direct` | GET | Direct config page (no token) |
| `/configure-xtream` | GET | Xtream config page (no token) |
| `/:token/configure-direct` | GET | Reconfigure direct (pre-filled if token decodes) |
| `/:token/configure-xtream` | GET | Reconfigure Xtream |
| `/:token/configure` | GET | Stremio's Configure button (redirects to the right mode) |
| `/:token/configure-data.json` | GET | Saved settings used to pre-fill the config page |
| `/:token/manifest.json` | GET | Stremio manifest |
| `/:token/catalog/:type/:id/:extra?.json` | GET | Catalog resource (SDK handled) |
| `/:token/stream/:type/:id.json` | GET | Stream resource |
| `/:token/meta/:type/:id.json` | GET | Meta resource |
| `/:token/logo/:tvgId.png` | GET | Logo proxy (tries multiple sources) |
| `/api/prefetch` | POST | Server-side fetch (CORS bypass, size limited) |
| `/encrypt` | POST | Returns encrypted token (requires `CONFIG_SECRET`) |
| `/health` | GET | Health probe (JSON) |
| `/api/info` | GET | Version and whether encryption is enabled (JSON) |

### Prefetch Example
```bash
curl -X POST http://localhost:7000/api/prefetch \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/playlist.m3u","purpose":"playlist"}'
```

---

## 🧬 Features Breakdown

| Feature | Direct M3U | Xtream JSON | Xtream m3u_plus | Notes |
|---------|------------|-------------|-----------------|-------|
| Live Channels Catalog | ✅ | ✅ | ✅ | Unified tv catalog |
| Movies Catalog | Heuristic (by title/year/group) | ✅ | ✅ | Filtering rules |
| Series Catalog | Heuristic (SxxEyy / Season X) | Native `get_series` + `get_series_info` | Heuristic | Per-episode videos |
| EPG | XMLTV custom or provided | Panel xmltv.php or custom | Panel xmltv.php or custom | Timezone + offset supported |
| Live TV only | ✅ | ✅ (skips VOD/series downloads) | ✅ | Removes movie & series catalogs |
| Group catalogs | ✅ (group-title) | ✅ (categories) | ✅ | Optional keyword filter, max 100 |
| Logos | tvg-logo / fallback proxy | Uses stream_icon / cover | tvg-logo where present | Multiple sources attempted |
| CORS Bypass | Yes (prefetch) | Yes (prefetch) | Yes (prefetch) | Browser first, fallback server |
| Encryption | Token-level | Token-level | Token-level | Optional |
| Caching | LRU + optional Redis | Same | Same | Cache key = hashed config |
| Series Episodes | Local heuristic grouping | On-demand per series (lazy) | Heuristic | Episode IDs = `iptv_series_ep_*` |

---

## ⛽ Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `7000` | HTTP server port |
| `REDIS_URL` | unset | Enable Redis caching (interface + data) |
| `CACHE_ENABLED` | `true` | Master toggle for LRU + Redis |
| `CACHE_TTL_MS` | `21600000` (6h) | TTL for cached data |
| `MAX_CACHE_ENTRIES` | `300` | LRU entry cap |
| `CONFIG_SECRET` | unset | 16+ chars. Config UI encrypts install links with it (AES-256-GCM) |
| `DEBUG_MODE` | `false` | Enables verbose diagnostic logs |
| `PREFETCH_ENABLED` | `true` | Enable server-side prefetch CORS bypass |
| `PREFETCH_MAX_BYTES` | `5000000` | Max bytes returned from `/api/prefetch` |
| `PREFETCH_EPG_MAX_BYTES` | `2000000` | Max bytes the config page downloads to sanity-check an EPG (server still loads the full guide) |
| `NODE_ENV` | (user value) | Standard Node semantics |

> Redis is optional. Without it, only in‑process LRU is used (per container).

---

## 🧱 Architecture (High-Level)

```
┌───────────────────────────┐
│      Browser Client       │
│ (Direct/Xtream Config UI) │
└──────────┬────────────────┘
           │ Pre-flight (fetch playlist & optional EPG)
           ▼
┌───────────────────────────┐
│      /api/prefetch        │  ← CORS bypass, size-limited, SSRF guarded
└──────────┬────────────────┘
           │ Token JSON
           ▼
┌───────────────────────────┐
│        server.js          │
│  - decrypt (if enc:)      │
│  - cache interface        │
│  - createAddon(config)    │
└──────────┬────────────────┘
           │
           ▼
┌───────────────────────────┐
│        addon.js           │
│  - load cache             │
│  - fetch provider data    │
│  - parse M3U / EPG        │
│  - build catalogs         │
└──────────┬────────────────┘
           │ Stremio resource routes
           ▼
┌───────────────────────────┐
│      Stremio Client       │
│  Catalog / Meta / Stream  │
└───────────────────────────┘
```

---

## 🔍 Series Handling

### Xtream JSON Mode
- Fetches `get_series`
- Per-series metadata lazily enriched via `get_series_info`
- Each episode becomes a `video` in the series meta, streamable by ID

### Direct / m3u_plus / Heuristic
- Detects patterns:
  - `S01E05`, `S1E2`, `Season 2 Episode 4`, `Season 3 Ep 09`
- Groups by *base series name* (title with season/episode suffix removed)
- Builds synthetic series entities with episodes list
- Missing season or episode → defaults to `season=1`, `episode=0`

---

## 🛡️ Security Considerations

| Area | Current Defense | Recommendation |
|------|------------------|----------------|
| Prefetch SSRF | Blocks localhost & RFC1918 ranges | Optionally maintain allowlist or DNS resolve & IP classify |
| Token Leakage | Long base64url token + optional encryption | Always use `CONFIG_SECRET` for shared public hosts |
| EPG Size | Prefetch max bytes & server timeouts | Adjust `PREFETCH_MAX_BYTES` for very large XMLTV feeds |
| DoS / Abuse | Basic size limits | Add rate limiting (e.g. `express-rate-limit`) |
| Sensitive Creds | Xtream credentials stored only in token | Encourage users not to share tokens publicly |

---

## 🧭 Usage Examples

### Direct Playlist (Plain)
1. Go to `/configure-direct`
2. Paste: `https://example.com/playlist.m3u`
3. (Optional) EPG: `https://example.com/guide.xml`
4. Copy manifest URL: `https://host/<TOKEN>/manifest.json`
5. Add to Stremio

### Xtream (JSON)
- Base URL: `http://panel.example.com:8080`
- Username / Password
- Leave “Use m3u_plus” unchecked
- Enable EPG (panel or custom)
- Install via generated manifest

### Xtream (m3u_plus)
- Tick “Use m3u_plus playlist”
- Optional output format: `ts` / `hls`
- EPG source choice + offset
- Install generated manifest

---

## 🧰 Local Testing (Catalog & Stream)

After configuration:

```bash
TOKEN=<paste-token>
HOST=http://localhost:7000

curl "$HOST/$TOKEN/manifest.json" | jq '.name,.version'

# TV catalog
curl "$HOST/$TOKEN/catalog/tv/iptv_channels.json" | jq '.metas[0]'

# Movie catalog search example
curl "$HOST/$TOKEN/catalog/movie/iptv_movies.json?search=action" | jq '.metas | length'

# Series meta (example ID)
curl "$HOST/$TOKEN/meta/series/iptv_series_<id>.json" | jq '.meta.videos[0]'
```

---

## 🧾 Logging & Debugging

| Mode | How |
|------|-----|
| Enable debug globally | `DEBUG_MODE=true` |
| Per-token debug | Check “Enable Debug Logging” in UI |
| Inspect parsing | Console shows playlist size, entries, EPG programmes |
| Timeout fallback | Buttons enable after build timeout to allow manual retry |

---

## 🗄️ Caching Strategy

| Layer | Scope | Contents |
|-------|-------|----------|
| In-Memory LRU | Per process | Addon data (channels/movies/series/epg) |
| Redis (optional) | Cross replicas | Same payload (JSON) + interface build marker |
| Build Promise Cache | Prevents simultaneous duplicate warm builds |

Cache key = `md5` of normalized config subset.

---

## ✨ Roadmap Ideas

- [ ] Genre filtering optimization
- [ ] Optional transcode / proxy (HLS rewriting)
- [ ] Multi-EPG merge & channel mapping UI
- [ ] Webhook or schedule-based background refresh
- [ ] Token revocation list
- [ ] Light theme toggle + user theme persistence
- [ ] Add channel favorites (local storage layer)

Want to help? See **Contributing** below.

---

## 🙋 FAQ

**Q: The playlist fetch fails with a CORS error.**  
A: The browser first attempt failed; server `/api/prefetch` will retry. Ensure `PREFETCH_ENABLED=true`.

**Q: EPG shows zero programmes.**  
A: The quick scan counts `<programme>` tags only. If compressed or gzipped, ensure server delivers uncompressed or extend prefetch to decompress.

**Q: Some logos missing.**  
A: The proxy tries multiple templates; contribute additional logo source patterns.

**Q: Token feels huge.**  
A: It’s a compact base64url JSON (or an encrypted blob when `CONFIG_SECRET` is set). Stremio handles it fine.

**Q: Do channels and the guide update by themselves?**  
A: Yes. The install link only holds your settings. The server re-downloads channels and the guide about every hour while you use it, so you only reinstall after changing a setting.

**Q: Series episodes missing (M3U).**  
A: Ensure naming matches patterns (`S01E01` or `Season 1 Episode 1`). Heuristic grouping cannot infer arbitrary naming.

---

## 🧑‍💻 Contributing

1. Fork & branch: `feat/your-feature`
2. Keep changes modular (UI / provider / core)
3. Run lint/tests (add if expanding)
4. Open PR with:
   - Summary + reproduction steps
   - Performance / memory notes if heavy parsing changes
   - Screenshots (UI changes) preferred

### Code Style Guidelines
- Prefer async/await over callbacks
- Avoid blocking large buffers (stream if >10MB future tasks)
- Keep provider logic separated (`providers/`)
- Guard network operations with timeouts

---

## 🐞 Reporting Issues

Please include:
- Node version
- Hosting method (Docker / bare / serverless)
- Provider type (direct / xtream-json / xtream-m3u)
- Sample (sanitized) playlist or line count
- Logs with `DEBUG_MODE=true` (scrub credentials)

Create an issue: https://github.com/namillis/M3U-XCAPI-EPG-IPTV-Stremio/issues

---

## ⚖️ Legal Notice

This project **does not provide** IPTV content.  
You are solely responsible for ensuring that playlists and streams you load are legal in your jurisdiction.  
The authors are not liable for misuse.

---

## 📄 License

MIT License (see `LICENSE` file).  
Attribution appreciated but not required.

---

## 🧪 Serverless Note

A `serverless.js` handler is included (experimental):
- Cold starts rebuild addon interface
- You must adapt dynamic token passing (currently static)

---

## 🔍 Internal: Episode & Stream ID Patterns

| Kind | Pattern |
|------|---------|
| Live Channel | `iptv_live_<stream_id | md5>` |
| Movie | `iptv_vod_<stream_id | md5>` |
| Series | `iptv_series_<series_id | hash>` |
| Episode | `iptv_series_ep_<episode_hash | xtream_id>` |

---

## 🛠️ Example Encrypted Token Flow

The config pages do this for you when `CONFIG_SECRET` is set. To do it by hand:

```bash
# 1. Start server with CONFIG_SECRET (16+ characters)
# 2. POST JSON config you would otherwise encode

curl -X POST http://localhost:7000/encrypt \
  -H 'Content-Type: application/json' \
  -d '{
        "provider":"direct",
        "m3uUrl":"https://example.com/list.m3u",
        "enableEpg":true,
        "epgUrl":"https://example.com/epg.xml"
      }'

# Response:
# { "token": "enc:..." }
# Manifest URL: https://host/enc:.../manifest.json
```

---

## 🧵 Troubleshooting Matrix

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| Buttons never enable | Manifest build error | Check server logs (addon build), ensure playlist accessible |
| 502 on `/api/prefetch` | Remote host blocked / TLS error | Try direct browser fetch or adjust server CA bundle |
| High memory usage | Massive playlist & no Redis | Increase RAM or add Redis to share cache across restarts |
| Missing search results | Stremio partial search | Use shorter, distinctive search terms; ensure case-insensitive |
| EPG times off | Guide uses local times labelled as UTC | Turn on "Guide times are already in my timezone" and keep `EPG Offset` at 0 |
| "Ran out of memory" on a 512 MB host | Huge playlist (VOD + series) | Enable **Live TV only**, or add Redis / more RAM |
| Channel fails, then plays on retry | Account stream limit or overloaded panel | Close other streams, wait a few seconds, retry |

---

## 🧩 Extending Providers

Add new provider:
1. Create `providers/myProvider.js` exporting `fetchData(addonInstance)` and optionally `fetchSeriesInfo`.
2. Normalize items to: `{ id, name, type: tv|movie|series, url, poster/logo, attributes:{...} }`.
3. Update config UI to set `provider: 'myProvider'`.
4. Adjust `addon.js` logic if custom behavior needed.

---

## 🌈 Theming

Current UI theme mimics Stremio’s dark violet aesthetic:
- Accent gradient: `#7043ff → #c58cff`
- Panels: layered deep navy/indigo
- Accessible contrast for logs/forms
- Responsive overlay with progress stripes

Feel free to PR:
- Alternate light mode
- High contrast accessibility mode
- User theme selector (localStorage)

---

## ✅ Final Checklist (Self-Host Launch)

| Step | Done? |
|------|-------|
| Playlist reachable via server & browser | ☐ |
| EPG XML reachable (or disabled gracefully) | ☐ |
| `CONFIG_SECRET` set (if sharing public) | ☐ |
| Reverse proxy passes through paths | ☐ |
| Optional HTTPS cert configured | ☐ |
| Redis deployed (optional scaling) | ☐ |
| Firewall restricts internal networks | ☐ |

---

**Happy streaming!**  
For ideas, feature requests, or large refactors — open a discussion first so we can align on direction.  
PRs welcome ❤️

---
