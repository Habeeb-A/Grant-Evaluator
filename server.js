// EA Grant Auditor - Backend API Proxy Server (Hardened & Debuggable)
// This is the improved server.js you should deploy to Render.
//
// Key changes included:
// - Dynamic CORS whitelist via ALLOWED_ORIGINS env var
// - Larger body parser limits (100mb) and urlencoded parser
// - Longer server and fetch timeouts (10 minutes)
// - Configurable rate limits via env vars, better rate-limit handler with Retry-After header
// - Request logging to help debug frontend <> backend CORS/origin problems
// - Clear, consistent JSON error responses (returned raw upstream error text when available)
//
// IMPORTANT: Set environment variables on Render as described in DEPLOYMENT.md
// - GEMINI_API_KEY
// - ALLOWED_ORIGINS (comma separated list of allowed origins)
// - (optional) RATE_LIMIT_MAX, GENERATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Request logging for debugging ---
app.use((req, res, next) => {
  const origin = req.get('origin') || 'no-origin';
  console.log(`[${new Date().toISOString()}] ${req.ip} -> ${req.method} ${req.originalUrl} (Origin: ${origin})`);
  next();
});

// --- CORS: dynamic whitelist from env variable (fallbacks included) ---
const allowedEnv = process.env.ALLOWED_ORIGINS || 'https://graev.netlify.app,https://your-netlify-site.netlify.app,http://localhost:3000,http://localhost:5173';
const allowedList = allowedEnv.split(',').map(s => s.trim()).filter(Boolean);

const corsOptionsDelegate = function (req, callback) {
  const origin = req.header('Origin');
  if (!origin) {
    // No origin (server-to-server or same-origin request)
    return callback(null, { origin: true, credentials: true });
  }

  if (allowedList.includes('*')) {
    return callback(null, { origin: true, credentials: true });
  }

  if (allowedList.indexOf(origin) !== -1) {
    return callback(null, { origin: true, credentials: true });
  } else {
    return callback(new Error(`Origin ${origin} not allowed by CORS`), { origin: false });
  }
};

// Increase body parser limits to handle large uploads (PDFs)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Apply CORS with delegate (handles preflight and actual)
app.use(cors(corsOptionsDelegate));
app.options('*', cors(corsOptionsDelegate)); // handle preflight

// --- Rate limiting ---
// Defaults (can be overridden via env)
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10); // 15 minutes
const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '200', 10); // default 200 requests per window
const DEFAULT_GENERATE_MAX = parseInt(process.env.GENERATE_LIMIT_MAX || '30', 10); // 30 requests/minute for generation

const limiter = rateLimit({
  windowMs: DEFAULT_WINDOW_MS,
  max: DEFAULT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfterSec = Math.ceil(DEFAULT_WINDOW_MS / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 429,
      retryAfter: `${retryAfterSec} seconds`
    });
  }
});

app.use('/api/', limiter);

const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: DEFAULT_GENERATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfterSec = 60;
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'Too many generation requests. Please wait a moment.',
      code: 429,
      retryAfter: `${retryAfterSec} seconds`
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'EA Grant Auditor API' });
});

// Proxy endpoint for Gemini API
app.post('/api/generate', generateLimiter, async (req, res) => {
  // Set generous timeout for long-running requests
  req.setTimeout(10 * 60 * 1000); // 10 minutes

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable is not set');
      return res.status(500).json({
        error: 'Server configuration error. Please contact the administrator.',
        code: 500
      });
    }

    const { contents, generationConfig } = req.body;
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({
        error: 'Invalid request: contents array is required',
        code: 400
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // Set timeout for fetch request (10 minutes)
    const controller = new AbortController();
    const timeoutMs = 10 * 60 * 1000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: generationConfig || { responseMimeType: 'application/json' }
        }),
        signal: controller.signal
      };

      // If Node's global fetch is available (Node 18+), this will work. Otherwise ensure node-fetch is installed.
      const response = await fetch(geminiUrl, fetchOptions);
      clearTimeout(timeoutId);

      let responseText = await response.text().catch(() => '');
      let data;
      try { data = responseText ? JSON.parse(responseText) : null; } catch (e) { data = null; }

      if (!response.ok && response.status !== 429) {
        console.error('HTTP error from Gemini API:', response.status, responseText.substring(0, 400));
        return res.status(response.status).json({
          error: data?.error?.message || `API request failed with status ${response.status}`,
          code: response.status,
          raw: responseText ? responseText.substring(0, 1000) : undefined
        });
      }

      if (data && data.error) {
        const errorCode = data.error.code || response.status || 500;
        const errorMessage = data.error.message || 'Unknown error';
        console.error('Gemini API error:', { code: errorCode, message: errorMessage });
        return res.status(errorCode === 429 ? 429 : (errorCode >= 400 && errorCode < 600 ? errorCode : 500)).json({
          error: errorMessage,
          code: errorCode
        });
      }

      const jsonData = data || (responseText ? JSON.parse(responseText) : null);

      if (jsonData && jsonData.candidates && jsonData.candidates[0] && jsonData.candidates[0].content) {
        const parts = jsonData.candidates[0].content.parts || [];
        const text = parts.length ? parts.map(p => p.text || '').join('') : (jsonData.candidates[0].content.text || '');
        return res.json({
          success: true,
          text: text
        });
      } else {
        console.error('Unexpected response format from Gemini API', responseText.substring(0, 1000));
        return res.status(502).json({
          error: 'Unexpected response format from upstream API',
          code: 502,
          raw: responseText ? responseText.substring(0, 1000) : undefined
        });
      }

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Request timeout after', timeoutMs, 'ms');
        return res.status(504).json({
          error: 'Request timeout. The API took too long to respond.',
          code: 504
        });
      }
      console.error('Network/fetch error to Gemini API:', fetchError && fetchError.message ? fetchError.message : fetchError);
      return res.status(502).json({
        error: 'Network error contacting upstream API',
        code: 502,
        message: fetchError && fetchError.message
      });
    }

  } catch (error) {
    console.error('Proxy error:', error && error.message ? error.message : error);
    let statusCode = 500;
    let errorMessage = 'Internal server error. Please try again later.';

    if (error.message && (error.message.includes('timeout') || error.message.includes('Timeout'))) {
      statusCode = 504;
      errorMessage = 'Request timeout. Please try again with a shorter document.';
    } else if (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('network'))) {
      statusCode = 503;
      errorMessage = 'Service temporarily unavailable. Please try again later.';
    } else if (error.message && (error.message.includes('ENOTFOUND'))) {
      statusCode = 503;
      errorMessage = 'Cannot connect to API service. Please try again later.';
    } else if (error.message && error.message.includes('Origin')) {
      statusCode = 401;
      errorMessage = error.message;
    }

    return res.status(statusCode).json({
      error: errorMessage,
      code: statusCode,
      details: process.env.NODE_ENV === 'development' ? (error.message || error) : undefined
    });
  }
});

// Start server and increase server timeout
const server = app.listen(PORT, () => {
  console.log(`✅ EA Grant Auditor API Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔒 API endpoint: http://localhost:${PORT}/api/generate`);
  console.log(`🌐 Allowed CORS origins: ${allowedList.join(', ')}`);
  if (process.env.GEMINI_API_KEY) {
    console.log('✅ API key loaded from environment');
  } else {
    console.error('⚠️  WARNING: GEMINI_API_KEY not found in environment variables!');
  }
});

// Set server-level timeout (10 minutes)
server.setTimeout(10 * 60 * 1000);

module.exports = app;
