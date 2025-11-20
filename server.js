// EA Grant Auditor - Backend API Proxy Server
// This server securely proxies requests to Google Gemini API
// API key is stored in environment variables and never exposed to clients

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Additional rate limiting for generate endpoint (more strict)
const generateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    error: 'Too many generation requests. Please wait a moment.',
    retryAfter: '1 minute'
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'EA Grant Auditor API' });
});

// Proxy endpoint for Gemini API
app.post('/api/generate', generateLimiter, async (req, res) => {
  try {
    // Get API key from environment variable
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('GEMINI_API_KEY environment variable is not set');
      return res.status(500).json({
        error: 'Server configuration error. Please contact the administrator.'
      });
    }

    // Validate request body
    const { contents, generationConfig } = req.body;
    
    if (!contents || !Array.isArray(contents)) {
      return res.status(400).json({
        error: 'Invalid request: contents array is required'
      });
    }

    // Prepare request to Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig: generationConfig || { responseMimeType: 'application/json' }
      })
    });

    const data = await response.json();

    // Handle errors from Gemini API
    if (data.error) {
      const errorCode = data.error.code || 500;
      const errorMessage = data.error.message || 'Unknown error';
      
      // Log error (without exposing API key)
      console.error('Gemini API error:', {
        code: errorCode,
        message: errorMessage.substring(0, 100) // Truncate for logging
      });

      return res.status(errorCode === 429 ? 429 : 500).json({
        error: errorMessage,
        code: errorCode
      });
    }

    // Return successful response
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      res.json({
        success: true,
        text: data.candidates[0].content.parts[0].text
      });
    } else {
      res.status(500).json({
        error: 'Unexpected response format from API'
      });
    }

  } catch (error) {
    // Log error (never log API key)
    console.error('Proxy error:', error.message);
    
    res.status(500).json({
      error: 'Internal server error. Please try again later.',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ EA Grant Auditor API Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔒 API endpoint: http://localhost:${PORT}/api/generate`);
  
  // Verify API key is loaded (but don't print it)
  if (process.env.GEMINI_API_KEY) {
    console.log('✅ API key loaded from environment');
  } else {
    console.error('⚠️  WARNING: GEMINI_API_KEY not found in environment variables!');
  }
});

module.exports = app;

