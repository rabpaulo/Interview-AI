import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to manage WebSocket connection with the Backend and Antigravity Agent.
 * Tracks message turns, streaming token updates, and tool calls.
 */
export function useAgentSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentThought, setCurrentThought] = useState('');
  const [currentToolCall, setCurrentToolCall] = useState(null);

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // When running with Vite proxy or directly on port 3001
    const wsUrl = `${protocol}//${window.location.hostname}:3001`;

    console.log('[WS Hook] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[WS Hook] Connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleServerEvent(payload);
      } catch (err) {
        console.error('[WS Hook] JSON parse error:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[WS Hook] Disconnected. Reconnecting in 2s...');
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[WS Hook] Socket error:', err);
      ws.close();
    };
  }, []);

  const handleServerEvent = useCallback((event) => {
    switch (event.type) {
      case 'connection_ack':
        if (event.conversationId) setConversationId(event.conversationId);
        if (event.isProcessing !== undefined) setIsProcessing(event.isProcessing);
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
          },
          {
            id: `agent-${Date.now()}`,
            role: 'agent',
            text: '',
            status: 'streaming',
            timestamp: Date.now(),
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

        // Step updates from stream-json
        if (data.event === 'step_update') {
          const step = data.step_update;

          if (step.conversation_id) {
            setConversationId(step.conversation_id);
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
          if (result.conversation_id) setConversationId(result.conversation_id);

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
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx].role === 'agent') {
            next[lastIdx] = {
              ...next[lastIdx],
              status: 'done',
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
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text, source = 'voice') => {
    if (!text?.trim()) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'voice_message',
          text: text.trim(),
          source,
        })
      );
    } else {
      console.error('[WS Hook] Cannot send message, socket not connected');
    }
  }, []);

  const abortAgent = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'abort' }));
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    fetch('/api/reset-session', { method: 'POST' }).catch(console.error);
  }, []);

  return {
    isConnected,
    isProcessing,
    conversationId,
    messages,
    currentThought,
    currentToolCall,
    sendMessage,
    abortAgent,
    clearMessages,
  };
}
