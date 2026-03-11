/**
 * Models Management Service
 *
 * Handles fetching and filtering models based on current mode
 */

import { getApiBaseSync } from './backendUrl';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  author?: string;
  status: string;
  size_bytes: number;
  format: string;
  download_source?: string;
  filename?: string;
  installed_version?: string;
  last_updated?: string;
  tags: string[];
  compatibility_score?: number;
  parameters?: string;
  context_length?: number;
  provider?: string;
}

/**
 * Get models filtered by mode (online/offline)
 */
export async function getModelsByMode(mode: 'online' | 'offline'): Promise<ModelInfo[]> {
  try {
    const response = await fetch(
      `${getApiBaseSync()}/models/by-mode?mode=${mode}`
    );

    if (!response.ok) {
      console.error(`Failed to get ${mode} models:`, response.statusText);
      return [];
    }

    const models: ModelInfo[] = await response.json();
    return models;
  } catch (error) {
    console.error(`Error getting ${mode} models:`, error);
    return [];
  }
}

/**
 * Get all models (no filtering)
 */
export async function getAllModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${getApiBaseSync()}/models`);

    if (!response.ok) {
      console.error('Failed to get all models:', response.statusText);
      return [];
    }

    const models: ModelInfo[] = await response.json();
    return models;
  } catch (error) {
    console.error('Error getting all models:', error);
    return [];
  }
}

/**
 * Get currently active/loaded model
 */
export async function getActiveModel(): Promise<any | null> {
  try {
    const response = await fetch(`${getApiBaseSync()}/models/active`);

    if (!response.ok) {
      return null;
    }

    const model = await response.json();
    return model;
  } catch (error) {
    console.error('Error getting active model:', error);
    return null;
  }
}

/**
 * Extract simple model list for dropdown
 */
export function toSimpleModelList(models: ModelInfo[]): Array<{ id: string; name: string }> {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
  }));
}

// ── Interrupted download persistence ────────────────────────────────────────
// Saved to localStorage so the user can resume after closing mid-download.
const INTERRUPTED_STORAGE_KEY = 'aud-io-interrupted-downloads';

export interface InterruptedDownload {
  model_id: string;
  model_name: string;
  /** Pre-built source payload as expected by /models/install */
  source: unknown;
  size_bytes: number;
  format?: string;
  description?: string;
  interrupted_at: string; // ISO timestamp
}

export function saveInterruptedDownload(download: Omit<InterruptedDownload, 'interrupted_at'>): void {
  try {
    const stored = localStorage.getItem(INTERRUPTED_STORAGE_KEY);
    const map: Record<string, InterruptedDownload> = stored ? JSON.parse(stored) : {};
    map[download.model_id] = { ...download, interrupted_at: new Date().toISOString() };
    localStorage.setItem(INTERRUPTED_STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function removeInterruptedDownload(modelNameOrId: string): void {
  try {
    const stored = localStorage.getItem(INTERRUPTED_STORAGE_KEY);
    if (!stored) return;
    const map: Record<string, InterruptedDownload> = JSON.parse(stored);
    // Try exact model_id key first, then fallback to searching by model_name
    if (map[modelNameOrId]) {
      delete map[modelNameOrId];
    } else {
      const key = Object.keys(map).find(k => map[k].model_name === modelNameOrId);
      if (key) delete map[key];
    }
    localStorage.setItem(INTERRUPTED_STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getInterruptedDownloads(): InterruptedDownload[] {
  try {
    const stored = localStorage.getItem(INTERRUPTED_STORAGE_KEY);
    if (!stored) return [];
    return Object.values(JSON.parse(stored) as Record<string, InterruptedDownload>);
  } catch { return []; }
}

/**
 * Re-issue a download for a previously interrupted model.
 * Uses the pre-built source payload saved at initial download time.
 */
export async function resumeDownload(download: InterruptedDownload): Promise<boolean> {
  try {
    const hfToken = localStorage.getItem('aud-io-hf-token') || undefined;
    const response = await fetch(`${getApiBaseSync()}/models/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: download.model_id,
        model_name: download.model_name,
        source: download.source,
        size_bytes: download.size_bytes,
        format: download.format,
        description: download.description,
        hf_token: hfToken,
      }),
    });
    return response.ok;
  } catch { return false; }
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiate a background model download via POST /models/install.
 * Mirrors the logic in ModelsPanel.handleInstallModel() but as a standalone
 * API helper so ChatWindow (or any component) can trigger downloads without
 * coupling to ModelsPanel internals.
 *
 * @param modelId   The model's id (e.g., "meta-llama/Llama-3-8B-Instruct-GGUF")
 * @param modelName Human-readable name shown in notifications
 * @returns true if the backend accepted the request, false otherwise
 */
export async function downloadModel(
  modelId: string,
  modelName: string
): Promise<boolean> {
  try {
    const hfToken = localStorage.getItem('aud-io-hf-token') || undefined;

    // Build the source payload — same logic as buildSourcePayload in ModelsPanel
    let source: unknown;
    if (modelId.startsWith('ollama:')) {
      source = { type: 'Ollama', model_name: modelId.slice(7) };
    } else if (modelId.startsWith('openrouter:')) {
      source = { type: 'OpenRouter', model_id: modelId.slice(11) };
    } else {
      // Default: HuggingFace GGUF
      const parts = modelId.split('/');
      const filename =
        parts.length > 1
          ? `${parts[parts.length - 1].toLowerCase().replace(/-gguf$/i, '')}.Q4_K_M.gguf`
          : `${modelId}.gguf`;
      source = { type: 'HuggingFace', repo_id: modelId, filename };
    }

    const response = await fetch(`${getApiBaseSync()}/models/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: modelId,
        model_name: modelName,
        source,
        hf_token: hfToken,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to start model download:', error);
    return false;
  }
}
