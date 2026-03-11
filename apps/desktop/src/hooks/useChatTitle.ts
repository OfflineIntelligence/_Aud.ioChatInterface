// useChatTitle: Hook for generating chat titles using the active model.
// Online mode  → OpenRouter with the same model used for the chat.
// Offline mode → local LLM via the backend /generate/title endpoint.
import { useState } from 'react';
import { getApiBaseSync } from '../api/backendUrl';

export interface GenerateTitleRequest {
  prompt: string;
  max_tokens?: number;
  // Online mode: forwarded to backend, which proxies to OpenRouter (CSP compliance).
  api_key?: string;
  model_id?: string;
}

export interface GenerateTitleResponse {
  title: string;
}

export interface OnlineTitleParams {
  apiKey: string;
  modelId: string;
}

export const useChatTitle = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateTitle = async (
    prompt: string,
    online?: OnlineTitleParams
  ): Promise<string | null> => {
    if (!prompt.trim()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Always route through the backend — the WebView cannot connect to external URLs
      // (Tauri CSP blocks direct connect-src to openrouter.ai).
      // For online mode, pass api_key + model_id so the backend proxies to OpenRouter.
      const body: GenerateTitleRequest = {
        prompt: prompt.trim(),
        max_tokens: 20,
        ...(online?.apiKey && online?.modelId
          ? { api_key: online.apiKey, model_id: online.modelId }
          : {}),
      };

      const response = await fetch(`${getApiBaseSync()}/generate/title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data: GenerateTitleResponse = await response.json();
        if (data.title) return data.title;
      }

      return null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      console.error('Failed to generate title:', errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generateTitle, loading, error };
};
