/**
 * useApiKeys Hook
 *
 * Manages API keys with backend persistence
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getApiKey,
  saveApiKey as apiSaveKey,
  deleteApiKey as apiDeleteKey,
  migrateKeysFromLocalStorage,
  type ApiKeyType,
} from '../api/apiKeys';

export function useApiKeys() {
  const [huggingFaceToken, setHuggingFaceToken] = useState<string | null>(null);
  const [openRouterKey, setOpenRouterKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load API keys from backend on mount
  useEffect(() => {
    async function loadApiKeys() {
      setIsLoading(true);
      try {
        // First, migrate any existing keys from localStorage
        await migrateKeysFromLocalStorage();

        // Load HuggingFace token
        const hfToken = await getApiKey('huggingface');
        if (hfToken) {
          setHuggingFaceToken(hfToken);
        }

        // Load OpenRouter key
        const orKey = await getApiKey('openrouter');
        if (orKey) {
          setOpenRouterKey(orKey);
        }
      } catch (err) {
        console.error('Failed to load API keys:', err);
        setError('Failed to load API keys');
      } finally {
        setIsLoading(false);
      }
    }

    loadApiKeys();
  }, []);

  // Save HuggingFace token
  const saveHuggingFaceToken = useCallback(async (token: string): Promise<boolean> => {
    try {
      const success = await apiSaveKey('huggingface', token);
      if (success) {
        setHuggingFaceToken(token);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to save HuggingFace token:', err);
      return false;
    }
  }, []);

  // Save OpenRouter key
  const saveOpenRouterKey = useCallback(async (key: string): Promise<boolean> => {
    try {
      const success = await apiSaveKey('openrouter', key);
      if (success) {
        setOpenRouterKey(key);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to save OpenRouter key:', err);
      return false;
    }
  }, []);

  // Delete HuggingFace token
  const deleteHuggingFaceToken = useCallback(async (): Promise<boolean> => {
    try {
      const success = await apiDeleteKey('huggingface');
      if (success) {
        setHuggingFaceToken(null);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete HuggingFace token:', err);
      return false;
    }
  }, []);

  // Delete OpenRouter key
  const deleteOpenRouterKey = useCallback(async (): Promise<boolean> => {
    try {
      const success = await apiDeleteKey('openrouter');
      if (success) {
        setOpenRouterKey(null);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to delete OpenRouter key:', err);
      return false;
    }
  }, []);

  return {
    huggingFaceToken,
    openRouterKey,
    isLoading,
    error,
    saveHuggingFaceToken,
    saveOpenRouterKey,
    deleteHuggingFaceToken,
    deleteOpenRouterKey,
    hasHuggingFaceToken: !!huggingFaceToken,
    hasOpenRouterKey: !!openRouterKey,
  };
}
