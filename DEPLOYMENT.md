# Deploying

**Everything runs on Netlify's free tier. There is no second service to pay for.**

The page is static and the one model call runs as a Netlify Function, so the front
end and the API are the same origin. Nothing sits in between to misroute a path, and
there is no CORS to configure — which is what broke the previous deployment.

`server.js` still exists and still works; it is the easier thing to run locally, and
it is there if you ever move to a host that runs a long-lived process. Production
does not use it.

---

## Step 1 — push

```bash
cd Grant-Evaluator
git push origin main
```

## Step 2 — connect the site

If **graev.netlify.app** is already connected to this GitHub repo, skip to step 3.

Otherwise: **app.netlify.com → Add new site → Import an existing project → GitHub →
Habeeb-A/Grant-Evaluator**. Leave the build settings alone; `netlify.toml` already
sets the publish directory and the functions directory.

## Step 3 — set the API key

**Site configuration → Environment variables → Add a variable:**

| Key | Value |
|---|---|
| `GEMINI_API_KEY` | your Google AI Studio key |

Optional:

| Key | Default |
|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` |

Set the scope to **all deploy contexts** unless you have a reason not to. The key is
read inside the function and never reaches the browser.

## Step 4 — deploy

**Deploys → Trigger deploy → Deploy site.** Environment variable changes do not take
effect until a new deploy runs.

## Step 5 — verify, before telling anyone

Two checks. Run both.

```bash
curl https://graev.netlify.app/api/health
```

Expect exactly this shape:

```json
{"status":"ok","service":"Grant Evaluator API","model":"gemini-3.8-flash","apiKeyConfigured":true}
```

- `"apiKeyConfigured": false` or a `503` — the key is not set, or the deploy predates
  it. Redo steps 3 and 4.
- **`{"service":"EA Grant Auditor API"}`** (the old name, no `apiKeyConfigured`) — an
  **old proxy rule is still intercepting `/api/*`** and sending it to the retired
  Railway backend. Find it under *Site configuration → Build & deploy → Post
  processing*, or in a stale `_redirects` in a previously deployed branch, and remove
  it. `netlify.toml` in this repo is now the only place redirects should live.

Then the one that actually matters:

```bash
curl -X POST -H 'Content-Type: application/json' -d '{"contents":[]}' \
  https://graev.netlify.app/api/generate
```

- **`400` with "a non-empty contents array is required"** — correct. The route is
  wired and the function ran.
- **HTML back** — the catch-all redirect is winning over the API rule. Check that the
  `/api/*` rules in `netlify.toml` still come *before* the `/*` rule.
- **`404`** — the function did not deploy. Check the deploy log for a Functions
  section listing `generate` and `health`.

Finally, open the site and evaluate a real proposal end to end. **A passing health
check is not evidence that an evaluation works.** The previous version returned a
green health check for months while every evaluation 404'd, which is the single
reason it stayed broken for so long.

---

## What this replaced, so it does not come back

The Netlify site proxied `/api/*` to a Railway service with the `/api` prefix
**stripped**. The front end's `POST /api/generate` arrived there as `/generate`, and
the server — which served `/api/generate` — answered `Cannot POST /generate`. Every
evaluation failed. `GET /api/health` kept returning `200` the whole time, because the
server happened to serve `/health`.

Two things now prevent it:

1. There is no proxy. The function is on the same origin as the page.
2. `server.js` answers on **both** `/api/generate` and `/generate`, so it survives
   either redirect shape if you ever put it behind a proxy again.

---

## After it is live

**Rate limits are what will bite you.** A free-tier Gemini key has a per-minute
request cap. One evaluation is one call, so light use is fine, but several people
evaluating at once will get failures until the window resets. Users see a clear
message rather than a hang. This is the first thing worth paying for if the tool gets
traction — roughly $0.02 per evaluation at current Flash pricing.

**There is no per-user rate limiting in production.** `express-rate-limit` lives in
`server.js`, which production no longer runs, and a serverless function has nowhere to
keep a counter. The provider's own limit is the only backstop, so a determined abuser
could burn the quota. If that happens, Netlify's rate limiting is a paid feature, and
the cheaper fix is to put the evaluate button behind a lightweight bot check.

**Netlify free tier gives 125,000 function invocations a month**, which is far more
headroom than the Gemini quota. The function is capped at a 26-second timeout; the
code gives up at 25 and returns a readable message rather than being killed.

**Function logs** are under *Logs → Functions*. Every failure path logs a reason.

**If you rotate the key**, update it in Environment variables and trigger a new
deploy. The old value stays live until you do.

---

## Running it locally

```bash
npm install
GEMINI_API_KEY=your-key npm start     # http://localhost:3000
```

That runs `server.js`, which serves the page and the API on one origin, mirroring
production closely enough for development. To exercise the actual Netlify Functions
locally instead, `npx netlify-cli dev`.
