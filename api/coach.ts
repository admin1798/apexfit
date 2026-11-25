import type { IncomingMessage, ServerResponse } from 'node:http';

export type ServerProviderId = 'gemini' | 'groq' | 'openrouter';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachApiPayload {
  provider?: ServerProviderId;
  model?: string;
  systemPrompt: string;
  contextJson: string;
  messages: ChatTurn[];
}

export interface CoachApiResult {
  status: number;
  headers?: Record<string, string>;
  body: Record<string, unknown>;
}

const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 15;
const rateBuckets = new Map<string, number[]>();

function checkRateLimit(sessionKey: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const prev = (rateBuckets.get(sessionKey) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = prev[0];
    const retryAfterSec = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000));
    rateBuckets.set(sessionKey, prev);
    return { allowed: false, retryAfterSec };
  }
  prev.push(now);
  rateBuckets.set(sessionKey, prev);
  return { allowed: true, retryAfterSec: 0 };
}

function getAvailableProviders(): ServerProviderId[] {
  const list: ServerProviderId[] = [];
  if (process.env.GEMINI_API_KEY?.trim()) list.push('gemini');
  if (process.env.GROQ_API_KEY?.trim()) list.push('groq');
  if (process.env.OPENROUTER_API_KEY?.trim()) list.push('openrouter');
  return list;
}

async function fetchWithTimeoutAndRetry(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
  maxRetries = 2
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Upstream LLM request failed');
}

async function callGeminiServer(payload: CoachApiPayload, apiKey: string): Promise<string> {
  const model = payload.model || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `${payload.systemPrompt}\n\nVERIFIED_USER_CONTEXT:\n${payload.contextJson}`,
        },
      ],
    },
    ...payload.messages.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ];

  const res = await fetchWithTimeoutAndRetry(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.35, maxOutputTokens: 700 },
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    const err = new Error(`Gemini HTTP ${res.status}: ${errTxt.slice(0, 120)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty completion');
  return text;
}

async function callOpenAICompatibleServer(
  endpoint: string,
  apiKey: string,
  model: string,
  payload: CoachApiPayload,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: `${payload.systemPrompt}\n\nVERIFIED_USER_CONTEXT:\n${payload.contextJson}`,
    },
    ...payload.messages.slice(-8).map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const res = await fetchWithTimeoutAndRetry(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    const err = new Error(`Provider HTTP ${res.status}: ${errTxt.slice(0, 120)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Provider returned empty completion');
  return text;
}

export async function processCoachRequest(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>
): Promise<CoachApiResult> {
  const sessionHeader = headers['x-apexfit-session'];
  const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

  if (!sessionId || sessionId.trim().length < 8) {
    return {
      status: 401,
      body: { error: 'UNAUTHORIZED', message: 'Missing or invalid ApexFit session header.' },
    };
  }

  const serverSecret = process.env.APEXFIT_API_SECRET?.trim();
  if (serverSecret) {
    const auth = headers.authorization;
    const authVal = Array.isArray(auth) ? auth[0] : auth;
    if (authVal !== `Bearer ${serverSecret}`) {
      return {
        status: 401,
        body: { error: 'UNAUTHORIZED', message: 'Invalid API authorization token.' },
      };
    }
  }

  if (rawBody.length > 48_000) {
    return {
      status: 413,
      body: { error: 'PAYLOAD_TOO_LARGE', message: 'Request context exceeded limit.' },
    };
  }

  const rl = checkRateLimit(sessionId.trim());
  if (!rl.allowed) {
    return {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec) },
      body: {
        error: 'RATE_LIMITED',
        message: `Rate limit reached. Please wait ${rl.retryAfterSec}s before retrying.`,
        retryAfterSec: rl.retryAfterSec,
      },
    };
  }

  let payload: CoachApiPayload;
  try {
    payload = JSON.parse(rawBody) as CoachApiPayload;
  } catch {
    return { status: 400, body: { error: 'BAD_REQUEST', message: 'Invalid JSON body.' } };
  }

  if (!payload.systemPrompt || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return {
      status: 400,
      body: { error: 'BAD_REQUEST', message: 'systemPrompt and messages are required.' },
    };
  }

  const provider: ServerProviderId = payload.provider ?? 'gemini';
  const availableProviders = getAvailableProviders();

  try {
    if (provider === 'gemini') {
      const key = process.env.GEMINI_API_KEY?.trim();
      if (!key) {
        return {
          status: 503,
          body: {
            error: 'PROVIDER_NOT_CONFIGURED',
            message: 'Server GEMINI_API_KEY is not configured.',
            availableProviders,
          },
        };
      }
      const reply = await callGeminiServer(payload, key);
      return {
        status: 200,
        body: {
          provider: 'gemini',
          model: payload.model || 'gemini-2.5-flash',
          content: reply,
          availableProviders,
        },
      };
    }

    if (provider === 'groq') {
      const key = process.env.GROQ_API_KEY?.trim();
      if (!key) {
        return {
          status: 503,
          body: {
            error: 'PROVIDER_NOT_CONFIGURED',
            message: 'Server GROQ_API_KEY is not configured.',
            availableProviders,
          },
        };
      }
      const model = payload.model || 'llama-3.3-70b-versatile';
      const reply = await callOpenAICompatibleServer(
        'https://api.groq.com/openai/v1/chat/completions',
        key,
        model,
        payload
      );
      return {
        status: 200,
        body: { provider: 'groq', model, content: reply, availableProviders },
      };
    }

    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) {
      return {
        status: 503,
        body: {
          error: 'PROVIDER_NOT_CONFIGURED',
          message: 'Server OPENROUTER_API_KEY is not configured.',
          availableProviders,
        },
      };
    }
    const model = payload.model || 'meta-llama/llama-3.3-70b-instruct:free';
    const reply = await callOpenAICompatibleServer(
      'https://openrouter.ai/api/v1/chat/completions',
      key,
      model,
      payload,
      { 'X-Title': 'ApexFit Personal Coach' }
    );
    return {
      status: 200,
      body: { provider: 'openrouter', model, content: reply, availableProviders },
    };
  } catch (err) {
    const statusErr = err as Error & { status?: number };
    const status = statusErr.status === 429 ? 429 : 502;
    return {
      status,
      body: {
        error: status === 429 ? 'UPSTREAM_RATE_LIMIT' : 'UPSTREAM_ERROR',
        message: statusErr.message || 'Upstream AI provider failed.',
        availableProviders,
      },
    };
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const result = await processCoachRequest(rawBody, req.headers);

  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json');
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(result.body));
}
