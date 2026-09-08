# Grant Evaluator

Reads a grant proposal against a fixed rubric, cites the passage behind every score,
and says plainly what it cannot assess.

It is a critic, not a funder. It does not produce a verdict, and it will not tell you
your proposal is a 7.2 out of 10.

## What it does

Seven criteria, each with published anchors at levels 1, 3, 5, 7 and 9:

| | |
|---|---|
| **Problem stake** | the magnitude of the harm this project addresses |
| **Causal mechanism** | the chain from funded activity to outcome — **this caps the assessment** |
| **Execution plan** | what will be done, in what order, by when, with whom |
| **Falsifiability** | what would show it worked, and what would show it did not |
| **Differentiation** | the argument for why this will not otherwise happen |
| **Resource coherence** | whether the ask, the plan and the people cohere |
| **Downside profile** | how the project could make things *worse*, not just fail |

Every score reports the anchor it came from, the anchor text one rung up, and a
verbatim quote from your document. **The quote is checked against the document in
your browser; if it cannot be found, the score is withdrawn** rather than reported.

## What it deliberately will not do

- **Give an overall score.** The bar a funder applies is a price set by their budget,
  not a fixed standard, so a single number with no funder behind it denotes nothing.
  What you get instead is the cap: which criterion limits the assessment, at what
  level, and what would raise it.
- **Score a criterion your document does not address.** That comes back as *not
  assessable* — not as a low score. A 1 means the anchor for 1 was positively
  matched; silence is a different finding.
- **Score your track record or team.** It cannot verify either, and a model asked to
  infer them from an affiliation will invent them. They are listed as questions a
  reviewer will ask instead.
- **Suggest stylistic edits.** Only changes to what the proposal says or commits to.
  Rewriting for tone measurably moves automated scores without changing the work.

Unaddressed downside routes to a human rather than lowering a number: a proposal that
never considers how it could cause harm is a different kind of finding from a weak
one.

## Running it

```bash
npm install
GEMINI_API_KEY=your-key npm start     # http://localhost:3000
```

The server serves the page and proxies the model call, so it runs as one service on
one origin. The API key stays server-side and never reaches the browser.

| Variable | |
|---|---|
| `GEMINI_API_KEY` | **required** |
| `GEMINI_MODEL` | optional, defaults to `gemini-3.8-flash` |
| `ALLOWED_ORIGINS` | comma-separated CORS allowlist |
| `PORT` | defaults to 3000 |

One model call per evaluation, which keeps it inside a free-tier key.

## Deploying

The whole app can run as a single service — point your host at `npm start` and set
`GEMINI_API_KEY`. That is the simplest arrangement and the one to prefer.

If you keep the split deployment (static site on Netlify, API elsewhere), note the
failure it caused before: the proxy forwarded `/api/*` with the `/api` prefix
stripped, so the front end's `POST /api/generate` arrived as `/generate` and returned
a 404 on **every** evaluation, while `/api/health` kept answering 200 and made the
site look healthy. The server now answers on both `/api/generate` and `/generate`, so
it works either way.

Check any deployment with:

```bash
curl -X POST -H 'Content-Type: application/json' -d '{"contents":[]}' https://your-site/api/generate
```

A `400` means the route is wired. HTML coming back means the front end and back end
disagree about the path again.

## Limits worth knowing

- **Nothing here is calibrated against real grantmakers.** There is no measurement
  that these scores track anything.
- **Long proposals are truncated** to 20,000 characters.
- **An absence is hard to cite.** Where the finding is that your document does *not*
  do something, the quote shown is the nearest related passage rather than proof.
- **Rate limits.** On a free-tier key, heavy traffic will hit the provider's
  per-minute limit and evaluations will fail until it resets.

MIT.
