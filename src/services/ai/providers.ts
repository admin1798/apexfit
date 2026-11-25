import type { AIProviderId } from '../../types';

export interface ProviderMeta {
  id: AIProviderId;
  label: string;
  defaultModel: string;
  freeTierNote: string;
}

export const AI_PROVIDERS: Record<AIProviderId, ProviderMeta> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (Free Tier)',
    defaultModel: 'gemini-2.5-flash',
    freeTierNote: 'Via /api/coach (server GEMINI_API_KEY)',
  },
  groq: {
    id: 'groq',
    label: 'Groq Llama 3.3 (Free Tier)',
    defaultModel: 'llama-3.3-70b-versatile',
    freeTierNote: 'Via /api/coach (server GROQ_API_KEY)',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter Free',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    freeTierNote: 'Via /api/coach (server OPENROUTER_API_KEY)',
  },
  local: {
    id: 'local',
    label: 'Local Coach Engine (Offline)',
    defaultModel: 'apexfit-deterministic-v2',
    freeTierNote: '100% offline on-device fitness intelligence',
  },
};

export interface LLMCallRequest {
  provider: AIProviderId;
  model?: string;
  systemPrompt: string;
  contextJson: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionToken: string;
}

export interface LLMCallResponse {
  content: string;
  providerUsed: AIProviderId;
  modelUsed: string;
}

export class AIProviderError extends Error {
  code: 'OFFLINE' | 'RATE_LIMITED' | 'PROVIDER_NOT_CONFIGURED' | 'UNAUTHORIZED' | 'TIMEOUT' | 'UPSTREAM';
  retryAfterSec?: number;

  constructor(
    code: AIProviderError['code'],
    message: string,
    retryAfterSec?: number
  ) {
    super(message);
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

let lastRequestAt = 0;

export function getOrCreateSessionToken(): string {
  const key = 'apexfit_session_token_v1';
  try {
    let token = localStorage.getItem(key);
    if (!token || token.length < 12) {
      token = `apx-${crypto.randomUUID()}`;
      localStorage.setItem(key, token);
    }
    return token;
  } catch {
    return 'apx-local-session-token';
  }
}

export async function invokeServerLLMProvider(req: LLMCallRequest): Promise<LLMCallResponse> {
  if (req.provider === 'local') {
    throw new AIProviderError('PROVIDER_NOT_CONFIGURED', 'Local engine selected.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new AIProviderError('OFFLINE', 'Device is offline.');
  }

  // Client-side cooldown guard to prevent rapid duplicate spam
  const now = Date.now();
  if (now - lastRequestAt < 1000) {
    throw new AIProviderError('RATE_LIMITED', 'Please wait a moment before sending again.', 2);
  }
  lastRequestAt = now;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 16_000);

  try {
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ApexFit-Session': req.sessionToken,
      },
      body: JSON.stringify({
        provider: req.provider,
        model: req.model || AI_PROVIDERS[req.provider].defaultModel,
        systemPrompt: req.systemPrompt,
        contextJson: req.contextJson,
        messages: req.messages,
      }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      content?: string;
      provider?: AIProviderId;
      model?: string;
      retryAfterSec?: number;
    };

    if (!res.ok) {
      if (res.status === 401) {
        throw new AIProviderError('UNAUTHORIZED', data.message || 'Unauthorized AI session.');
      }
      if (res.status === 429) {
        throw new AIProviderError(
          'RATE_LIMITED',
          data.message || 'Rate limit reached.',
          data.retryAfterSec ?? 15
        );
      }
      if (res.status === 503 || data.error === 'PROVIDER_NOT_CONFIGURED') {
        throw new AIProviderError(
          'PROVIDER_NOT_CONFIGURED',
          data.message || 'Server AI provider key not configured.'
        );
      }
      throw new AIProviderError('UPSTREAM', data.message || `AI service error (${res.status}).`);
    }

    if (!data.content) {
      throw new AIProviderError('UPSTREAM', 'AI provider returned an empty response.');
    }

    return {
      content: data.content,
      providerUsed: data.provider ?? req.provider,
      modelUsed: data.model ?? AI_PROVIDERS[req.provider].defaultModel,
    };
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AIProviderError('TIMEOUT', 'AI request timed out after 16s.');
    }
    throw new AIProviderError('UPSTREAM', err instanceof Error ? err.message : 'Network error.');
  } finally {
    window.clearTimeout(timeout);
  }
}
