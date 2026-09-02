// src/router/v1.js
// OpenAI-compatible surface: POST /v1/chat/completions and GET /v1/models,
// implemented on top of the existing Puppeteer-driven ChatGPT automation.
// Point any OpenAI SDK / client at this server's base URL (e.g.
// http://localhost:3001/v1) and it works as a drop-in.
const express = require('express');
const crypto = require('crypto');
const { performLoginWithBasicAuth } = require('../flows/openai_emailAuth');
const { getPage } = require('../services/puppeteerService');
const { promptWithOptions } = require('../flows/openai_promptFlow');
const { isChatGPTLoggedIn } = require('../utils/helpers');
const { withPageLock } = require('../utils/pageLock');
const { getLogger } = require('../utils/logger');

const logger = getLogger('v1.js');
const router = express.Router();

const MODELS = ['gpt-4o', 'gpt-4o-search', 'gpt-4o-reason', 'gpt-4', 'gpt-3.5-turbo'];

// Optional bearer-token auth, mirroring `Authorization: Bearer sk-...`.
// Only enforced when API_KEY is set — unset means "open", matching the
// underlying project's local-use-only posture.
function requireApiKey(req, res, next) {
  const configuredKey = process.env.API_KEY;
  if (!configuredKey) return next();

  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== configuredKey) {
    return res.status(401).json({
      error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' },
    });
  }
  next();
}

router.use(requireApiKey);

// Best-effort thread continuity: keyed by a hash of "the conversation so far
// including our own last reply", so that when a client appends our reply +
// a new user turn (the normal OpenAI chat-history pattern), the next call's
// prefix hashes to a known ChatGPT threadId and we only send the new turn
// instead of replaying the whole conversation. This is heuristic — it only
// hits when the client echoes messages back byte-for-byte. Callers that need
// guaranteed continuity should pass an explicit `thread_id`.
const threadCache = new Map();
const THREAD_CACHE_LIMIT = 500;

function cacheKey(messages) {
  return crypto.createHash('sha256').update(JSON.stringify(messages)).digest('hex');
}

function rememberThread(messages, content, threadId) {
  if (!threadId) return;
  if (threadCache.size >= THREAD_CACHE_LIMIT) {
    threadCache.delete(threadCache.keys().next().value); // evict oldest
  }
  const withAssistant = [...messages, { role: 'assistant', content }];
  threadCache.set(cacheKey(withAssistant), threadId);
}

function messageTextContent(content) {
  // OpenAI messages allow `content` to be a plain string or an array of
  // content parts (text/image/etc). We only forward text parts — the
  // underlying automation has no vision input.
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => !part.type || part.type === 'text')
      .map((part) => (typeof part === 'string' ? part : part.text || ''))
      .join('\n');
  }
  return '';
}

function messagesToPrompt(messages) {
  const roleLabel = { assistant: 'Assistant', system: 'System', user: 'User' };
  return messages
    .map((m) => `${roleLabel[m.role] || 'User'}: ${messageTextContent(m.content)}`)
    .join('\n\n');
}

// Lets clients pick reason/search mode via the model name (e.g.
// "gpt-4o-reason", "gpt-4o-search") without inventing a non-standard body
// field, since most OpenAI SDKs only let you set `model` freely.
function optionsFromModel(model = '') {
  return {
    reason: /reason|o1|o3/i.test(model),
    search: /search/i.test(model),
  };
}

// Rough token estimate (~4 chars/token) — good enough for clients that just
// display usage, since the real tokenizer isn't available here.
function estimateTokens(text = '') {
  return Math.max(1, Math.ceil(text.length / 4));
}

router.get('/models', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  res.json({
    object: 'list',
    data: MODELS.map((id) => ({ id, object: 'model', created: now, owned_by: 'chatgpt-unofficial' })),
  });
});

router.get('/models/:id', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  res.json({ id: req.params.id, object: 'model', created: now, owned_by: 'chatgpt-unofficial' });
});

router.post('/chat/completions', async (req, res) => {
  logger.debug('POST:/v1/chat/completions', 'incoming request');
  const { model = 'gpt-4o', messages, stream = false, thread_id: bodyThreadId } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: { message: '"messages" is required and must be a non-empty array.', type: 'invalid_request_error' },
    });
  }

  try {
    const result = await withPageLock(async () => {
      const page = getPage();

      if (await isChatGPTLoggedIn(page)) {
        logger.debug('POST:/v1/chat/completions', '✅ already signed in — skipping login flow');
      } else {
        logger.debug('POST:/v1/chat/completions', '🔐 not signed in — running login flow…');
        await performLoginWithBasicAuth(page);
      }

      const knownThreadId = bodyThreadId || threadCache.get(cacheKey(messages.slice(0, -1)));
      const prompt = knownThreadId ? messagesToPrompt(messages.slice(-1)) : messagesToPrompt(messages);
      const { reason, search } = optionsFromModel(model);

      return promptWithOptions(page, { reason, search, threadId: knownThreadId }, prompt);
    });

    const content = result.response || '';
    rememberThread(messages, content, result.threadId);

    const completionId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);
    const promptTokens = estimateTokens(messages.map((m) => messageTextContent(m.content)).join('\n'));
    const completionTokens = estimateTokens(content);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendChunk = (delta, finishReason = null) => {
        const chunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      sendChunk({ role: 'assistant', content: '' });

      // The automation only ever yields the fully-settled response text (it
      // polls the DOM until the text stops changing), not real token-by-token
      // output — so we simulate streaming by re-chunking the final text.
      // Clients built for SSE (LangChain, most chat UIs) still work correctly.
      const words = content.split(/(\s+)/).filter(Boolean);
      for (const word of words) {
        sendChunk({ content: word });
        await new Promise((r) => setTimeout(r, 12));
      }

      sendChunk({}, 'stop');
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    res.status(200).json({
      id: completionId,
      object: 'chat.completion',
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      // Non-standard extension: exposes the underlying ChatGPT thread id so
      // callers who want guaranteed (not heuristic) continuity can pass it
      // back explicitly as `thread_id` on their next request.
      thread_id: result.threadId,
    });
  } catch (err) {
    logger.error('POST:/v1/chat/completions', err.stack || err.message);
    if (res.headersSent) {
      // Mid-stream failure: best effort to signal the client, then close.
      res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
      return res.end();
    }
    res.status(500).json({ error: { message: err.message || 'Internal server error', type: 'server_error' } });
  }
});

module.exports = router;
