/**
 * The model call, as a Netlify Function.
 *
 * This exists so the whole tool runs on Netlify's free tier with no second service
 * to pay for or keep alive. It replaces server.js in production; server.js still
 * works and is the easier thing to run locally.
 *
 * It also removes the failure that made the previous deployment unusable. The front
 * end and this function are the same origin, so there is no proxy in between to
 * misroute the path and no CORS to configure. The route is declared in netlify.toml
 * ahead of the catch-all, which is the part that has to be right.
 *
 * The API key is read from the environment here and never reaches the browser.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { success: false, error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Deliberately explicit: this is the mistake someone makes once per deploy,
    // and a vague message costs an hour of looking in the wrong place.
    console.error('GEMINI_API_KEY is not set on this site.');
    return json(500, {
      success: false,
      error: 'This site is not configured with an API key. Set GEMINI_API_KEY in the Netlify site environment variables.',
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { success: false, error: 'Request body was not valid JSON.' });
  }

  const { contents, generationConfig } = payload || {};
  if (!Array.isArray(contents) || contents.length === 0) {
    return json(400, { success: false, error: 'Invalid request: a non-empty contents array is required.' });
  }

  // Netlify's free tier caps a function at 10 seconds of wall clock, so give up a
  // little before that rather than being killed mid-flight with no message.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          generationConfig: {
            responseMimeType: 'application/json',
            // Thinking is on by default on current Gemini models, is billed as
            // output, AND is drawn from the same maxOutputTokens allowance as the
            // answer — so leaving it on truncates the response before any JSON is
            // emitted. The caller can still override this.
            thinkingConfig: { thinkingBudget: 0 },
            ...(generationConfig || {}),
          },
        }),
      },
    );

    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* handled below */ }

    if (data?.error) {
      const code = data.error.code || res.status || 500;
      console.error('Gemini error', code, String(data.error.message).slice(0, 200));
      return json(code === 429 ? 429 : 502, {
        success: false,
        error: code === 429
          ? 'The model provider is rate-limiting this site. Wait a minute and try again.'
          : data.error.message || 'The model provider rejected the request.',
        code,
      });
    }

    if (!res.ok) {
      console.error('Gemini HTTP', res.status, raw.slice(0, 200));
      return json(502, { success: false, error: `The model provider returned ${res.status}.`, code: res.status });
    }

    const candidate = data?.candidates?.[0];
    const finish = candidate?.finishReason;

    // A safety stop is a finding about the document, not a server error, and it
    // should not be retried somewhere else.
    if (data?.promptFeedback?.blockReason || finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
      return json(422, {
        success: false,
        error: 'The model declined to assess this document. It has not been scored. A person should look at it.',
      });
    }

    const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text.trim()) {
      return json(502, {
        success: false,
        error: finish === 'MAX_TOKENS'
          ? 'The response was cut off before it was complete. Try a shorter proposal.'
          : 'The model returned an empty response.',
      });
    }

    return json(200, { success: true, text });
  } catch (err) {
    if (err.name === 'AbortError') {
      return json(504, { success: false, error: 'The evaluation took too long and was stopped. Try a shorter proposal.' });
    }
    console.error('generate failed:', err.message);
    return json(502, { success: false, error: 'The evaluation could not be completed. Nothing was saved.' });
  } finally {
    clearTimeout(timer);
  }
};
