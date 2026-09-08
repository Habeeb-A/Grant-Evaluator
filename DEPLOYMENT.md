# Deploying

Two arrangements work. **Take the first one** — it is fewer moving parts, and it
removes the failure that made the previous deployment unusable.

---

## Option A — everything on Railway, one service (recommended)

The server now serves the page as well as proxying the model call, so the front end
and the API are the same origin. There is no proxy in between to misroute anything,
and no CORS to configure.

### 1. Push the code

```bash
cd Grant-Evaluator
git push origin main
```

### 2. Create the Railway service

1. Go to **railway.com** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo**.
3. Pick **Habeeb-A/Grant-Evaluator**.

Railway reads `package.json`, installs dependencies, and runs `npm start`. There is
nothing to configure for the build.

### 3. Set the API key

In the service, open **Variables** and add:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | your Google AI Studio key |

That is the only required variable. Optional ones:

| Name | Default | |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` | change the model without a code change |
| `GENERATE_LIMIT_MAX` | `10` | evaluations per minute per IP |
| `RATE_LIMIT_MAX` | `50` | total API requests per 15 min per IP |

**Do not set `PORT`.** Railway injects it, and the server already reads it.

### 4. Give it a public URL

**Settings → Networking → Generate Domain.** You get something like
`grant-evaluator-production.up.railway.app`.

### 5. Check it before telling anyone

```bash
curl https://YOUR-APP.up.railway.app/api/health
```

Expect `{"status":"ok","service":"EA Grant Auditor API","model":"gemini-3.8-flash"}`.

Then the one that actually matters:

```bash
curl -X POST -H 'Content-Type: application/json' -d '{"contents":[]}' \
  https://YOUR-APP.up.railway.app/api/generate
```

- **`400` with a message about `contents`** — correct. The route is wired and the
  request reached Gemini.
- **HTML, or `Cannot POST`** — the front end and back end disagree about the path.
  This is exactly what broke the last deployment.
- **`500` about a server configuration error** — `GEMINI_API_KEY` is not set.

Finally open the URL in a browser and evaluate a real proposal end to end. A health
check passing is not evidence that an evaluation works; that assumption is what let
the previous version sit broken.

### 6. Point your domain at it (optional)

In Railway, **Settings → Networking → Custom Domain**, then add the CNAME it gives
you at your DNS provider. If you want `graev.netlify.app` retired, delete the Netlify
site or replace it with a redirect so there is only one live copy.

---

## Option B — keep Netlify for the page, Railway for the API

Only worth it if you specifically want Netlify's CDN or an existing domain there.

1. Deploy the API to Railway exactly as in Option A, steps 1–5.
2. In **Netlify → Site configuration → Environment**, nothing is needed; the front
   end calls `window.location.origin`, so the proxy does the work.
3. In the Netlify site, make sure a redirect sends the API through. Put it in
   `netlify.toml` in this repo, **not** in the dashboard, so it is version-controlled:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://YOUR-APP.up.railway.app/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

The `/api/*` rule **must come first** — Netlify applies the first match, and the
catch-all would otherwise swallow it.

4. Add the Netlify origin to the API's allowlist. In Railway **Variables**:

```
ALLOWED_ORIGINS = https://graev.netlify.app,https://your-custom-domain.com
```

5. Run the same `curl` check from step 5 above **against the Netlify URL**, not the
Railway one. That is the path your users take, and it is the one that was broken.

### What went wrong here last time

The dashboard redirect forwarded `/api/*` to the API with the `/api` prefix
**stripped**, so `POST /api/generate` arrived at the server as `/generate` and
returned `Cannot POST /generate`. Every evaluation 404'd for as long as the site was
up, while `GET /api/health` kept returning `200` because the server happened to serve
`/health` — so it looked healthy the entire time.

The server now answers on **both** `/api/generate` and `/generate`, so it survives
either redirect shape. The `curl` check in step 5 is what catches it if it recurs.

---

## After it is live

**Rate limits are the thing that will bite you.** A free-tier Gemini key has a
per-minute request cap. One evaluation is one call, so light use is fine, but if
several people evaluate at once they will get failures until the window resets. If
the tool gets traction, that is the first thing to pay for.

**Watch the logs** in Railway for the first few real uses. The server logs every
request with its origin, which is enough to see a CORS or routing problem
immediately.

**The key is server-side and must stay there.** It is only ever read from
`process.env` in `server.js` and never sent to the browser. Do not put it in
`index.html`.

**If you rotate the key**, change it in Railway Variables — the service restarts on
its own. No redeploy needed.
