import { useState, useEffect, useMemo } from 'react';
import { PROVIDERS } from '../config/models.js';

const STORAGE_KEY = 'perssua_agent_settings_v1';

export function useAgentSettings() {
  const [provider, setProviderState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (PROVIDERS[parsed.provider]) return parsed.provider;
      }
    } catch {}
    return 'antigravity';
  });

  const [models, setModelsState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          antigravity: parsed.models?.antigravity || PROVIDERS.antigravity.defaultModel,
          codex: parsed.models?.codex || PROVIDERS.codex.defaultModel,
        };
      }
    } catch {}
    return {
      antigravity: PROVIDERS.antigravity.defaultModel,
      codex: PROVIDERS.codex.defaultModel,
    };
  });

  const [reasoningEfforts, setReasoningEffortsState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          antigravity: parsed.reasoningEfforts?.antigravity || PROVIDERS.antigravity.defaultReasoning,
          codex: parsed.reasoningEfforts?.codex || PROVIDERS.codex.defaultReasoning,
        };
      }
    } catch {}
    return {
      antigravity: PROVIDERS.antigravity.defaultReasoning,
      codex: PROVIDERS.codex.defaultReasoning,
    };
  });

  const [fastMode, setFastModeState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.fastMode === 'boolean') return parsed.fastMode;
      }
    } catch {}
    return true;
  });

  const [candidateContext, setCandidateContext] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return typeof saved.candidateContext === 'string' ? saved.candidateContext.slice(0, 6000) : '';
    } catch { return ''; }
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          provider,
          models,
          reasoningEfforts,
          fastMode,
          candidateContext,
        })
      );
    } catch (e) {
      console.warn('Failed to save agent settings:', e);
    }
  }, [provider, models, reasoningEfforts, fastMode, candidateContext]);

  const setProvider = (newProvider) => {
    if (PROVIDERS[newProvider]) {
      setProviderState(newProvider);
    }
  };

  const setModel = (modelId, targetProvider = provider) => {
    setModelsState((prev) => ({
      ...prev,
      [targetProvider]: modelId,
    }));
  };

  const setReasoningEffort = (effort, targetProvider = provider) => {
    setReasoningEffortsState((prev) => ({
      ...prev,
      [targetProvider]: effort,
    }));
  };

  const toggleFastMode = () => {
    setFastModeState((prev) => !prev);
  };

  const setFastMode = (val) => {
    setFastModeState(Boolean(val));
  };

  const currentProviderConfig = PROVIDERS[provider];
  const currentModelId = models[provider] || currentProviderConfig.defaultModel;
  const currentModel = useMemo(() => {
    return (
      currentProviderConfig.models.find((m) => m.id === currentModelId) ||
      currentProviderConfig.models[0]
    );
  }, [currentProviderConfig, currentModelId]);

  const currentReasoning = reasoningEfforts[provider] || currentProviderConfig.defaultReasoning;

  return {
    provider,
    setProvider,
    models,
    setModel,
    reasoningEfforts,
    setReasoningEffort,
    fastMode,
    setFastMode,
    toggleFastMode,
    candidateContext,
    setCandidateContext,
    currentProviderConfig,
    currentModelId,
    currentModel,
    currentReasoning,
  };
}
