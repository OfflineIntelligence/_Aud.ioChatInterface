/**
 * useModels Hook
 *
 * Manages model fetching with mode-based filtering
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getModelsByMode,
  getAllModels,
  getActiveModel,
  toSimpleModelList,
  type ModelInfo,
} from '../api/models';

export function useModels(mode: 'online' | 'offline') {
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [allModelsInfo, setAllModelsInfo] = useState<ModelInfo[]>([]);
  const [activeModel, setActiveModel] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch models based on current mode
  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const modelsInfo = await getModelsByMode(mode);
      setAllModelsInfo(modelsInfo);
      setModels(toSimpleModelList(modelsInfo));

      // Also fetch active model
      const active = await getActiveModel();
      setActiveModel(active);
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setError('Failed to fetch models');
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  // Fetch models when mode changes
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Manually refresh models
  const refreshModels = useCallback(async () => {
    await fetchModels();
  }, [fetchModels]);

  return {
    models,
    allModelsInfo,
    activeModel,
    isLoading,
    error,
    refreshModels,
  };
}
