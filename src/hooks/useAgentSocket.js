import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to manage WebSocket connection with the Backend and Antigravity / Codex Agents.
 * Tracks message turns, streaming token updates, and tool calls.
 */
export function useAgentSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationIds, setConversationIds] = useState({ antigravity: null, codex: null });
  const [messages, setMessages] = useState([]);
  const [currentThought, setCurrentThought] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState(null);

  // PC Loopback Audio & Copilot States
  const [pcAudioLevel, setPcAudioLevel] = useState(0);
  const [isPcCapturing, setIsPcCapturing] = useState(false);
  const [isPcSpeaking, setIsPcSpeaking] = useState(false);
  const [isTranscribingPc, setIsTranscribingPc] = useState(false);
  const [pcAudioError, setPcAudioError] = useState(null);
  const [pcLiveTranscripts, setPcLiveTranscripts] = useState([]);
  const speakingUtteranceRef = useRef(null);
  const pendingUtterancesRef = useRef(new Set());
  const [selectedProvider, setSelectedProvider] = useState('antigravity');
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [selectedPersona, setSelectedPersona] = useState(() => {
    try {
      return localStorage.getItem('perssua_persona_v1') || 'general';
    } catch {
      return 'general';
    }
  });
  const [autoRespond, setAutoRespond] = useState(true);
  const [availableModels, setAvailableModels] = useState([]);
  const [availableSinks, setAvailableSinks] = useState([]);
  const [lastPcTranscript, setLastPcTranscript] = useState('');

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const activeSettingsRef = useRef({
    provider: 'antigravity',
    model: 'gemini-3.8-flash',
    reasoningEffort: 'medium',
    fastMode: true,
  });

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || '127.0.0.1';
    let wsUrl = `${protocol}//${host}:3001`;
    if (window.location.port === '3001') {
      wsUrl = `${protocol}//${window.location.host}`;
    }

    console.log('[WS Hook] Connecting to:', wsUrl);
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('[WS Hook] Failed to create WebSocket:', e);
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
      return;
    }

    socketRef.current = ws;

    ws.onopen = () => {
      if (socketRef.current !== ws) return;
      console.log('[WS Hook] Connected successfully to', wsUrl);
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'sync_settings', ...activeSettingsRef.current }));
      try {
        const savedPersona = localStorage.getItem('perssua_persona_v1');
        if (savedPersona) {
          ws.send(JSON.stringify({ type: 'set_persona', persona: savedPersona }));
        }
      } catch {}
    };

    ws.onmessage = (event) => {
      if (socketRef.current !== ws) return;
      try {
        const payload = JSON.parse(event.data);
        handleServerEvent(payload);
      } catch (err) {
        console.error('[WS Hook] JSON parse error:', err);
      }
    };

    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      socketRef.current = null;
      console.warn('[WS Hook] Disconnected. Reconnecting in 2s...');
      setIsConnected(false);
      setIsPcCapturing(false);
      setIsPcSpeaking(false);
      setIsTranscribingPc(false);
      setPcLiveTranscripts([]);
      speakingUtteranceRef.current = null;
      pendingUtterancesRef.current.clear();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      if (socketRef.current !== ws) return;
      console.warn('[WS Hook] WebSocket connection failed; retrying after close.');
      try {
        ws.close();
      } catch {}
    };
  }, []);

  const handleServerEvent = useCallback((event) => {
    switch (event.type) {
      case 'connection_ack':
        if (event.conversationIds) setConversationIds(event.conversationIds);
        if (event.conversationId) {
          setConversationIds((prev) => ({ ...prev, antigravity: event.conversationId }));
        }
        if (event.isProcessing !== undefined) setIsProcessing(event.isProcessing);
        if (event.selectedProvider) setSelectedProvider(event.selectedProvider);
        if (event.selectedModel) setSelectedModel(event.selectedModel);
        if (event.selectedPersona) setSelectedPersona(event.selectedPersona);
        if (event.autoRespond !== undefined) setAutoRespond(event.autoRespond);
        if (event.availableModels) setAvailableModels(event.availableModels);
        if (event.availableSinks) setAvailableSinks(event.availableSinks?.sinks || []);
        if (event.pcAudioStatus?.isCapturing !== undefined) setIsPcCapturing(event.pcAudioStatus.isCapturing);
        break;

      case 'agent_session':
        if (event.status === 'ready' && event.conversationId && event.provider) {
          setConversationIds((prev) => ({ ...prev, [event.provider]: event.conversationId }));
        }
        break;

      case 'session_reset':
        setPcLiveTranscripts([]);
        speakingUtteranceRef.current = null;
        pendingUtterancesRef.current.clear();
        setIsPcSpeaking(false);
        setIsTranscribingPc(false);
        setPcAudioError(null);
        setMessages([]);
        setCurrentThought('');
        setCurrentToolCall(null);
        setIsProcessing(false);
        if (event.activeConversationIds) {
          setConversationIds(event.activeConversationIds);
        } else {
          setConversationIds({ antigravity: null, codex: null });
        }
        break;

      case 'settings_synced':
        if (event.provider) setSelectedProvider(event.provider);
        if (event.model) setSelectedModel(event.model);
        break;

      case 'pc_audio_level':
        setPcAudioLevel(event.level || 0);
        break;

      case 'pc_capture_status':
        setIsPcCapturing(!!event.isCapturing);
        if (!event.isCapturing) {
          setIsPcSpeaking(false);
          setIsTranscribingPc(false);
          setPcLiveTranscripts([]);
          speakingUtteranceRef.current = null;
          pendingUtterancesRef.current.clear();
        }
        break;

      case 'pc_speech_start':
        speakingUtteranceRef.current = event.utteranceId || 'legacy';
        setIsPcSpeaking(true);
        break;

      case 'pc_speech_end':
        if (speakingUtteranceRef.current === (event.utteranceId || 'legacy')) {
          speakingUtteranceRef.current = null;
          setIsPcSpeaking(false);
        }
        if (event.discarded) setPcLiveTranscripts((prev) => prev.filter((item) => item.utteranceId !== event.utteranceId));
        break;

      case 'pc_speech_partial':
        setPcAudioError(null);
        setPcLiveTranscripts((prev) => {
          const next = prev.filter((item) => item.utteranceId !== event.utteranceId);
          return [...next, { utteranceId: event.utteranceId, text: event.text }];
        });
        break;

      case 'pc_speech_processing':
        if (speakingUtteranceRef.current === (event.utteranceId || 'legacy')) {
          speakingUtteranceRef.current = null;
          setIsPcSpeaking(false);
        }
        pendingUtterancesRef.current.add(event.utteranceId || 'legacy');
        setIsTranscribingPc(true);
        break;

      case 'pc_speech_transcribed':
        setPcAudioError(null);
        if (speakingUtteranceRef.current === (event.utteranceId || 'legacy')) {
          speakingUtteranceRef.current = null;
          setIsPcSpeaking(false);
        }
        pendingUtterancesRef.current.delete(event.utteranceId || 'legacy');
        setIsTranscribingPc(pendingUtterancesRef.current.size > 0);
        setPcLiveTranscripts((prev) => prev.filter((item) => item.utteranceId !== event.utteranceId));
        setLastPcTranscript(event.text);
        setMessages((prev) => {
          const message = {
            id: `pc-${event.utteranceId || Date.now()}`,
            role: 'interlocutor',
            text: event.text,
            timestamp: event.timestamp || Date.now(),
            durationSec: event.durationSec,
          };
          const replyIndex = prev.findIndex((item) => item.id === `copilot-pc-${event.utteranceId}`);
          if (replyIndex < 0) return [...prev, message];
          return [...prev.slice(0, replyIndex), message, ...prev.slice(replyIndex)];
        });
        break;

      case 'pc_speech_error':
        if (speakingUtteranceRef.current === (event.utteranceId || 'legacy')) {
          speakingUtteranceRef.current = null;
          setIsPcSpeaking(false);
        }
        pendingUtterancesRef.current.delete(event.utteranceId || 'legacy');
        setIsTranscribingPc(pendingUtterancesRef.current.size > 0);
        setPcLiveTranscripts((prev) => prev.filter((item) => item.utteranceId !== event.utteranceId));
        setPcAudioError(event.error || 'Não foi possível transcrever o áudio do PC.');
        break;

      case 'copilot_started':
        setIsProcessing(true);
        setMessages((prev) => {
          const existing = event.replyId ? prev.findIndex((item) => item.id === event.replyId) : -1;
          const message = {
            id: event.replyId || `copilot-${Date.now()}`,
            role: 'copilot',
            text: existing >= 0 ? prev[existing].text : '',
            isUpdating: existing >= 0 && !!prev[existing].text,
            isPreview: !!event.isPreview,
            status: 'streaming',
            provider: event.provider,
            model: event.model,
            persona: event.persona,
            prompt: event.prompt,
            timestamp: event.timestamp || Date.now(),
          };
          if (existing < 0) return [...prev, message];
          return prev.map((item, index) => index === existing ? message : item);
        });
        break;

      case 'copilot_token':
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = event.replyId ? next.findIndex((item) => item.id === event.replyId) : next.length - 1;
          if (next[lastIdx]?.role === 'copilot') {
            next[lastIdx] = {
              ...next[lastIdx],
              text: event.fullText ?? ((next[lastIdx].text || '') + event.token),
              isUpdating: false,
              isPreview: event.isPreview ?? next[lastIdx].isPreview,
              provider: event.provider || next[lastIdx].provider,
              model: event.model || next[lastIdx].model,
            };
          }
          return next;
        });
        break;

      case 'copilot_completed':
        setIsProcessing(false);
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = event.replyId ? next.findIndex((item) => item.id === event.replyId) : next.length - 1;
          if (next[lastIdx]?.role === 'copilot') {
            next[lastIdx] = {
              ...next[lastIdx],
              text: event.response || next[lastIdx].text,
              status: 'done',
              isUpdating: false,
              isPreview: event.isPreview ?? next[lastIdx].isPreview,
              provider: event.provider || next[lastIdx].provider,
              model: event.model || next[lastIdx].model,
              persona: event.persona || next[lastIdx].persona,
            };
          }
          return next;
        });
        break;

      case 'copilot_error':
        setIsProcessing(false);
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = event.replyId ? next.findIndex((item) => item.id === event.replyId) : next.length - 1;
          if (next[lastIdx]?.role === 'copilot') {
            next[lastIdx] = {
              ...next[lastIdx],
              text: `Erro no Copiloto: ${event.error}`,
              status: 'error',
              isUpdating: false,
            };
          }
          return next;
        });
        break;

      case 'copilot_finalized':
        setMessages((prev) => prev.map((item) => item.id === event.replyId ? { ...item, isPreview: false } : item));
        break;

      case 'copilot_cancelled':
        setIsProcessing(false);
        // Active cancellation also removes the unfinished snapshot below.
      case 'copilot_discarded':
        setMessages((prev) => prev.filter((item) => item.id !== event.replyId || item.text).map((item) =>
          item.id === event.replyId ? { ...item, status: 'cancelled', isUpdating: false } : item));
        break;

      case 'provider_changed':
        if (event.provider) setSelectedProvider(event.provider);
        break;

      case 'model_changed':
        if (event.model) setSelectedModel(event.model);
        break;

      case 'persona_changed':
        if (event.persona) setSelectedPersona(event.persona);
        break;

      case 'auto_respond_changed':
        setAutoRespond(!!event.autoRespond);
        break;

      case 'user_message_acknowledged':
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            text: event.text,
            timestamp: event.timestamp || Date.now(),
            source: event.source || 'voice',
            provider: event.provider,
            model: event.model,
            reasoningEffort: event.reasoningEffort,
            fastMode: event.fastMode,
          },
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            text: '',
            status: 'streaming',
            timestamp: Date.now(),
            provider: event.provider,
            model: event.model,
            reasoningEffort: event.reasoningEffort,
            fastMode: event.fastMode,
            tools: [],
          },
        ]);
        setIsProcessing(true);
        setCurrentThought('');
        setCurrentToolCall(null);
        break;

      case 'agent_status':
        setIsProcessing(true);
        break;

      case 'agent_stream': {
        const data = event.data;

        // Step updates from stream-json or JSONL
        if (data.event === 'step_update') {
          const step = data.step_update;

          if (step.conversation_id && event.provider) {
            setConversationIds((prev) => ({
              ...prev,
              [event.provider]: step.conversation_id,
            }));
          }

          if (step.text_delta) {
            setMessages((prev) => {
              if (prev.length === 0) return prev;
              const next = [...prev];
              const lastIdx = next.length - 1;
              if (next[lastIdx].role === 'agent') {
                next[lastIdx] = {
                  ...next[lastIdx],
                  text: (next[lastIdx].text || '') + step.text_delta,
                  provider: event.provider || next[lastIdx].provider,
                  model: event.model || next[lastIdx].model,
                  reasoningEffort: event.reasoningEffort || next[lastIdx].reasoningEffort,
                  fastMode: event.fastMode !== undefined ? event.fastMode : next[lastIdx].fastMode,
                };
              }
              return next;
            });
          }

          // Tool activity or reasoning
          if (step.step_type && step.step_type !== 'agent_response' && step.step_type !== 'user_input') {
            setCurrentToolCall({
              type: step.step_type,
              state: step.state,
              details: step.tool_call || step.details || null,
            });
          }
        }

        // Final result event
        if (data.event === 'result') {
          const result = data.result;
          setIsProcessing(false);
          setCurrentToolCall(null);
          if (result.conversation_id && event.provider) {
            setConversationIds((prev) => ({
              ...prev,
              [event.provider]: result.conversation_id,
            }));
          }

          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (next[lastIdx].role === 'agent') {
              next[lastIdx] = {
                ...next[lastIdx],
                text: result.response || next[lastIdx].text,
                status: 'done',
                duration: result.duration_seconds,
                usage: result.usage,
                provider: event.provider || next[lastIdx].provider,
                model: event.model || next[lastIdx].model,
                reasoningEffort: event.reasoningEffort || next[lastIdx].reasoningEffort,
                fastMode: event.fastMode !== undefined ? event.fastMode : next[lastIdx].fastMode,
              };
            }
            return next;
          });
        }
        break;
      }

      case 'agent_done':
        setIsProcessing(false);
        setCurrentToolCall(null);
        if (event.conversationId && event.provider) {
          setConversationIds((prev) => ({
            ...prev,
            [event.provider]: event.conversationId,
          }));
        }
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx].role === 'agent') {
            next[lastIdx] = {
              ...next[lastIdx],
              status: 'done',
              provider: event.provider || next[lastIdx].provider,
              model: event.model || next[lastIdx].model,
            };
          }
          return next;
        });
        break;

      case 'agent_error':
        setIsProcessing(false);
        setCurrentToolCall(null);
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx].role === 'agent') {
            next[lastIdx] = {
              ...next[lastIdx],
              status: 'error',
              error: event.error,
              text: next[lastIdx].text
                ? next[lastIdx].text + `\n\n*(Erro: ${event.error})*`
                : `Erro na execução: ${event.error}`,
            };
          }
          return next;
        });
        break;

      case 'agent_aborted':
        setIsProcessing(false);
        setCurrentToolCall(null);
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx].role === 'agent') {
            next[lastIdx] = {
              ...next[lastIdx],
              status: 'aborted',
              text: (next[lastIdx].text || '') + '\n\n*(Interrompido pelo usuário)*',
            };
          }
          return next;
        });
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const activeSocket = socketRef.current;
      socketRef.current = null;
      if (activeSocket) {
        activeSocket.onopen = null;
        activeSocket.onmessage = null;
        activeSocket.onerror = null;
        activeSocket.onclose = null;
        activeSocket.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((text, source = 'voice', settings = {}) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    const currentProvider = settings.provider || activeSettingsRef.current.provider || 'antigravity';
    const currentModel = settings.model || activeSettingsRef.current.model;
    const currentReasoning = settings.reasoningEffort || activeSettingsRef.current.reasoningEffort || 'medium';
    const currentFastMode = settings.fastMode !== undefined ? settings.fastMode : activeSettingsRef.current.fastMode;

    const payload = {
      type: 'voice_message',
      text: trimmed,
      source,
      provider: currentProvider,
      model: currentModel,
      reasoningEffort: currentReasoning,
      fastMode: currentFastMode !== false,
    };

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      console.warn('[WS Hook] WebSocket not open, falling back to HTTP /api/message...');
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          text: trimmed,
          timestamp: Date.now(),
          source,
          provider: payload.provider,
          model: payload.model,
          reasoningEffort: payload.reasoningEffort,
          fastMode: payload.fastMode,
        },
        {
          id: `agent-${Date.now()}`,
          role: 'agent',
          text: '',
          status: 'streaming',
          timestamp: Date.now(),
          provider: payload.provider,
          model: payload.model,
          reasoningEffort: payload.reasoningEffort,
          fastMode: payload.fastMode,
          tools: [],
        },
      ]);
      setIsProcessing(true);

      fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((data) => {
          setIsProcessing(false);
          setMessages((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (next[lastIdx]?.role === 'agent') {
              next[lastIdx] = {
                ...next[lastIdx],
                text: data.response || 'Comando executado.',
                status: 'done',
                provider: data.provider || payload.provider,
                model: data.model || payload.model,
              };
            }
            return next;
          });
        })
        .catch((err) => {
          console.error('[HTTP Fallback Error]:', err);
          setIsProcessing(false);
          setMessages((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (next[lastIdx]?.role === 'agent') {
              next[lastIdx] = {
                ...next[lastIdx],
                text: `Erro ao comunicar com o servidor: ${err.message}`,
                status: 'error',
              };
            }
            return next;
          });
        });
    }
  }, []);

  const abortAgent = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'abort' }));
    }
  }, []);

  const resetSession = useCallback((provider = null) => {
    setMessages([]);
    setCurrentThought('');
    setCurrentToolCall(null);
    setIsProcessing(false);
    setConversationIds({ antigravity: null, codex: null });

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'reset_session', provider }));
      return;
    }

    fetch('/api/reset-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    }).catch(console.error);
  }, []);

  const syncSettings = useCallback((settings) => {
    activeSettingsRef.current = {
      ...activeSettingsRef.current,
      ...settings,
    };
    if (settings.provider) setSelectedProvider(settings.provider);
    if (settings.model) setSelectedModel(settings.model);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'sync_settings',
          provider: settings.provider,
          model: settings.model,
          reasoningEffort: settings.reasoningEffort,
          fastMode: settings.fastMode,
          candidateContext: settings.candidateContext,
        })
      );
    }
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {});
  }, []);

  const startPcCapture = useCallback((options = {}) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'start_pc_capture', options }));
    } else {
      fetch('/api/audio-capture/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }).catch(console.error);
    }
  }, []);

  const stopPcCapture = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'stop_pc_capture' }));
    } else {
      fetch('/api/audio-capture/stop', { method: 'POST' }).catch(console.error);
    }
  }, []);

  const changeModel = useCallback((model) => {
    setSelectedModel(model);
    activeSettingsRef.current.model = model;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'set_model', model }));
    }
  }, []);

  const changePersona = useCallback((persona) => {
    setSelectedPersona(persona);
    try {
      localStorage.setItem('perssua_persona_v1', persona);
    } catch {}
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'set_persona', persona }));
    }
  }, []);

  const toggleAutoRespond = useCallback((val) => {
    setAutoRespond(val);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'set_auto_respond', autoRespond: val }));
    }
  }, []);

  const triggerCopilot = useCallback((text = null, settings = {}) => {
    const currentProvider = settings.provider || activeSettingsRef.current.provider || 'antigravity';
    const currentModel = settings.model || activeSettingsRef.current.model;
    const currentReasoning = settings.reasoningEffort || activeSettingsRef.current.reasoningEffort || 'medium';
    const currentFastMode = settings.fastMode !== undefined ? settings.fastMode : activeSettingsRef.current.fastMode;
    const currentPersona = settings.persona || selectedPersona || 'general';

    const payload = {
      type: 'trigger_copilot',
      text,
      provider: currentProvider,
      model: currentModel,
      persona: currentPersona,
      reasoningEffort: currentReasoning,
      fastMode: currentFastMode,
    };

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      fetch('/api/copilot/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(console.error);
    }
  }, []);

  return {
    isConnected,
    isProcessing,
    conversationIds,
    messages,
    currentThought,
    currentToolCall,
    sendMessage,
    abortAgent,
    resetSession,
    clearMessages: resetSession,
    syncSettings,

    // PC Loopback Audio & Copilot
    pcAudioLevel,
    isPcCapturing,
    isPcSpeaking,
    isTranscribingPc,
    pcAudioError,
    pcLiveTranscripts,
    clearPcAudioError: () => setPcAudioError(null),
    selectedProvider,
    selectedModel,
    selectedPersona,
    autoRespond,
    availableModels,
    availableSinks,
    lastPcTranscript,
    startPcCapture,
    stopPcCapture,
    changeModel,
    changePersona,
    toggleAutoRespond,
    triggerCopilot,
  };
}
