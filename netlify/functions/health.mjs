/**
 * Health check.
 *
 * Reports whether the API key is actually present, because "the site is up" and
 * "the site can evaluate anything" are different questions and the previous
 * deployment answered the first one green for months while the second was broken.
 *
 * It never returns the key or any part of it.
 */
export default async () => {
  const configured = Boolean(process.env.GEMINI_API_KEY);
  return new Response(
    JSON.stringify({
      status: configured ? 'ok' : 'misconfigured',
      service: 'Grant Evaluator API',
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      apiKeyConfigured: configured,
    }),
    {
      status: configured ? 200 : 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
