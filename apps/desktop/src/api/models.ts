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
