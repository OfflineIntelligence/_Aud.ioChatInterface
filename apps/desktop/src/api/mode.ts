/**
 * Mode Management Service
 *
 * Handles switching between online and offline modes:
 * - Online: Uses OpenRouter API for inference
 * - Offline: Uses local llama.cpp engine with downloaded models
 */

import { getApiBaseSync } from './backendUrl';
import { markApiKeyUsed } from './apiKeys';

export type Mode = 'online' | 'offline';

export interface SwitchModeResponse {
  success: boolean;
  mode: string;
  engine_status: string; // "running" | "stopped" | "unavailable" | "not_needed"
  message: string;
}

export interface ModeStatusResponse {
  current_mode: string; // "online" | "offline"
  engine_available: boolean;
  engine_status: string; // "running" | "stopped" | "unavailable"
  hf_token_set: boolean;
  openrouter_key_set: boolean;
  installed_models_count: number;
  openrouter_models_count: number;
}

/**
 * Switch between online and offline modes
 */
export async function switchMode(mode: Mode): Promise<SwitchModeResponse> {
  try {
    const response = await fetch(`${getApiBaseSync()}/mode/switch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode }),
    });

    if (!response.ok) {
      console.error('Failed to switch mode:', response.statusText);
      return {
        success: false,
        mode,
        engine_status: 'unavailable',
        message: `Failed to switch to ${mode} mode`,
      };
    }

    const data: SwitchModeResponse = await response.json();

    // Mark the appropriate API key as used
    if (data.success) {
      const keyType = mode === 'offline' ? 'huggingface' : 'openrouter';
      await markApiKeyUsed(keyType, mode);
    }

    return data;
  } catch (error) {
    console.error('Error switching mode:', error);
    return {
      success: false,
      mode,
      engine_status: 'unavailable',
      message: `Error: ${error}`,
    };
  }
}

/**
 * Get current mode status from backend
 */
export async function getModeStatus(): Promise<ModeStatusResponse | null> {
  try {
    const response = await fetch(`${getApiBaseSync()}/mode/status`);

    if (!response.ok) {
      console.error('Failed to get mode status:', response.statusText);
      return null;
    }

    const data: ModeStatusResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting mode status:', error);
    return null;
  }
}

/**
 * Check if the system is ready for offline mode
 */
export async function canUseOfflineMode(): Promise<{
  canUse: boolean;
  reason?: string;
}> {
  const status = await getModeStatus();

  if (!status) {
    return {
      canUse: false,
      reason: 'Unable to get system status',
    };
  }

  if (!status.engine_available) {
    return {
      canUse: false,
      reason: 'No llama.cpp engine installed. Please wait for auto-download or install manually.',
    };
  }

  if (status.installed_models_count === 0) {
    return {
      canUse: false,
      reason: 'No local models installed. Please install a model from the Models panel.',
    };
  }

  return { canUse: true };
}

/**
 * Check if the system is ready for online mode
 */
export async function canUseOnlineMode(): Promise<{
  canUse: boolean;
  reason?: string;
}> {
  const status = await getModeStatus();

  if (!status) {
    return {
      canUse: false,
      reason: 'Unable to get system status',
    };
  }

  if (!status.openrouter_key_set) {
    return {
      canUse: false,
      reason: 'OpenRouter API key not configured. Please add your API key.',
    };
  }

  return { canUse: true };
}
