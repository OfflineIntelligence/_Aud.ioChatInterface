/**
 * ApiKeyContext — single source of truth for OpenRouter and HuggingFace API keys.
 *
 * Every component (ModelsPanel, SettingsPanel, ChatWindow, …) reads from and
 * writes to this context.  Changes made in any panel are instantly visible in
 * every other panel — no polling, no timeouts, no stale state.
 *
 * Persistence strategy (in order of priority):
 *   1. OS keychain  — the backend writes the key to Windows Credential Manager /
 *                     macOS Keychain / libsecret via the `keyring` Rust crate.
 *   2. localStorage  — kept for legacy compatibility and instant cold-start reads
 *                     before the async backend fetch resolves.
 *   3. React state  — drives re-renders across all subscribed components.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { saveApiKey, deleteApiKey, getAllApiKeys, migrateKeysFromLocalStorage } from '../api/apiKeys';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiKeyContextValue {
  /** Current OpenRouter API key — empty string when not set. */
  openRouterApiKey: string;
  /** Current HuggingFace token — empty string when not set. */
  hfToken: string;
  /** True while the initial load from the backend is in flight. */
  isLoading: boolean;
  /**
   * Persist and broadcast a new OpenRouter key.
   * Writes to the OS keychain (via backend), localStorage, and React state.
   */
  setOpenRouterApiKey: (key: string) => void;
  /**
   * Persist and broadcast a new HuggingFace token.
   * Writes to the OS keychain (via backend), localStorage, and React state.
   */
  setHfToken: (token: string) => void;
  /** Delete the OpenRouter key from keychain, localStorage, and React state. */
  clearOpenRouterApiKey: () => void;
  /** Delete the HuggingFace token from keychain, localStorage, and React state. */
  clearHfToken: () => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  // Cold-start: read from localStorage so the UI is populated before the async
  // backend fetch resolves (avoids a flicker of "Not set" badges).
  const [openRouterApiKey, _setOpenRouterApiKey] = useState<string>(
    () => localStorage.getItem('aud-io-openrouter-key') ?? ''
  );
  const [hfToken, _setHfToken] = useState<string>(
    () => localStorage.getItem('aud-io-hf-token') ?? ''
  );
  const [isLoading, setIsLoading] = useState(true);

  // On mount: migrate any legacy localStorage keys → backend (OS keychain),
  // then pull the authoritative values back into React state.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // One-time migration: localStorage → OS keychain (idempotent, safe to retry).
        await migrateKeysFromLocalStorage();

        // Fetch the canonical values from the backend (from keychain / XOR fallback).
        const keys = await getAllApiKeys();
        if (cancelled) return;

        for (const k of keys) {
          if (k.key_type === 'openrouter' && k.value) {
            _setOpenRouterApiKey(k.value);
            localStorage.setItem('aud-io-openrouter-key', k.value);
          }
          if (k.key_type === 'huggingface' && k.value) {
            _setHfToken(k.value);
            localStorage.setItem('aud-io-hf-token', k.value);
          }
        }
      } catch {
        // Non-fatal: backend may not be ready on first launch.
        // The cold-start localStorage values are still in state.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Setters ───────────────────────────────────────────────────────────────

  /**
   * Persist a new OpenRouter key:
   *  1. Update React state immediately (instant UI feedback)
   *  2. Sync to localStorage (cold-start + legacy compat)
   *  3. Persist to OS keychain via backend (fire-and-forget)
   */
  const setOpenRouterApiKey = useCallback((key: string) => {
    _setOpenRouterApiKey(key);
    if (key) {
      localStorage.setItem('aud-io-openrouter-key', key);
      saveApiKey('openrouter', key).catch(console.error);
    } else {
      localStorage.removeItem('aud-io-openrouter-key');
      deleteApiKey('openrouter').catch(console.error);
    }
  }, []);

  const setHfToken = useCallback((token: string) => {
    _setHfToken(token);
    if (token) {
      localStorage.setItem('aud-io-hf-token', token);
      saveApiKey('huggingface', token).catch(console.error);
    } else {
      localStorage.removeItem('aud-io-hf-token');
      deleteApiKey('huggingface').catch(console.error);
    }
  }, []);

  // ── Clearers ──────────────────────────────────────────────────────────────

  const clearOpenRouterApiKey = useCallback(() => {
    _setOpenRouterApiKey('');
    localStorage.removeItem('aud-io-openrouter-key');
    deleteApiKey('openrouter').catch(console.error);
  }, []);

  const clearHfToken = useCallback(() => {
    _setHfToken('');
    localStorage.removeItem('aud-io-hf-token');
    deleteApiKey('huggingface').catch(console.error);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <ApiKeyContext.Provider
      value={{
        openRouterApiKey,
        hfToken,
        isLoading,
        setOpenRouterApiKey,
        setHfToken,
        clearOpenRouterApiKey,
        clearHfToken,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Access API key state and setters from any component.
 *
 * @example
 * const { openRouterApiKey, setOpenRouterApiKey, hfToken } = useApiKeys();
 */
export function useApiKeys(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) {
    throw new Error('useApiKeys must be used inside <ApiKeyProvider>');
  }
  return ctx;
}
