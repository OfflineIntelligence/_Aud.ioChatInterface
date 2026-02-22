/**
 * useMode Hook
 *
 * Manages online/offline mode state with backend synchronization
 */

import { useState, useEffect, useCallback } from 'react';
import {
  switchMode as apiSwitchMode,
  getModeStatus,
  canUseOfflineMode,
  canUseOnlineMode,
  type Mode,
  type ModeStatusResponse,
} from '../api/mode';

export function useMode() {
  const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
  const [modeStatus, setModeStatus] = useState<ModeStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial mode status from backend
  useEffect(() => {
    async function loadModeStatus() {
      setIsLoading(true);
      try {
        const status = await getModeStatus();
        if (status) {
          setModeStatus(status);
          // Set initial mode based on backend state
          setIsOnlineMode(status.current_mode === 'online');
        }
      } catch (err) {
        console.error('Failed to load mode status:', err);
        setError('Failed to load mode status');
      } finally {
        setIsLoading(false);
      }
    }

    loadModeStatus();
  }, []);

  // Switch mode with backend API
  const switchMode = useCallback(async (newMode: Mode): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if we can use the requested mode
      const canUse =
        newMode === 'offline'
          ? await canUseOfflineMode()
          : await canUseOnlineMode();

      if (!canUse.canUse) {
        setError(canUse.reason || 'Cannot switch to this mode');
        setIsLoading(false);
        return false;
      }

      // Switch mode via backend
      const response = await apiSwitchMode(newMode);

      if (!response.success) {
        setError(response.message);
        setIsLoading(false);
        return false;
      }

      // Update local state
      setIsOnlineMode(newMode === 'online');

      // Refresh mode status
      const status = await getModeStatus();
      if (status) {
        setModeStatus(status);
      }

      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('Error switching mode:', err);
      setError('Failed to switch mode');
      setIsLoading(false);
      return false;
    }
  }, []);

  // Toggle between online/offline
  const toggleMode = useCallback(async (): Promise<boolean> => {
    const newMode: Mode = isOnlineMode ? 'offline' : 'online';
    return await switchMode(newMode);
  }, [isOnlineMode, switchMode]);

  return {
    isOnlineMode,
    modeStatus,
    isLoading,
    error,
    switchMode,
    toggleMode,
    canUseOffline: modeStatus?.engine_available && modeStatus?.installed_models_count > 0,
    canUseOnline: modeStatus?.openrouter_key_set,
  };
}
