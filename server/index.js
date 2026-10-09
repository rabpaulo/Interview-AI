import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runUnifiedAgent, prepareAgentSession, closeAgentSession } from './agent-bridge.js';
import { systemAudioEngine, SystemAudioEngine } from './system-audio-engine.js';
import { transcribeAudioBuffer } from './transcriber.js';
import { wirePcTranscription } from './pc-transcription.js';
import { createLiveCopilot } from './live-copilot.js';
import { readCandidateContext } from './candidate-context.js';
import { AVAILABLE_MODELS, AVAILABLE_PERSONAS, generateCopilotResponse } from './gemini-copilot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Log every HTTP request
app.use((req, res, next) => {
  console.log(`[HTTP ${req.method}] ${req.url}`);
  next();
});

// Serve frontend static build if dist exists
if (fs.existsSync(distPath)) {
  console.log(`[Server] Serving static frontend from ${distPath}`);
  app.use(express.static(distPath));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const activeConversationIds = {
  antigravity: null,
  codex: null,
};
let activeAgentProcess = null;
let copilotGeneration = 0;

let selectedProvider = 'antigravity';
let selectedModel = 'gemini-3.8-flash';
let selectedReasoningEffort = 'medium';
let selectedFastMode = true;
let selectedPersona = 'general';
let candidateContext = '';
let autoRespond = true;
let lastPcTranscript = '';
let activeLanguage = 'pt-BR';

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Session preparation is independent of response generation and never sends a prompt.
let preparationGeneration = 0;
let preparationKey = null;
let agentSession = { status: 'starting', provider: selectedProvider };
function prepareSelectedSession() {
  if (activeAgentProcess) return;
  const key = JSON.stringify([selectedProvider, selectedModel, selectedReasoningEffort, selectedFastMode]);
  if (preparationKey === key && agentSession.status !== 'error') return;
  preparationKey = key;
  const generation = ++preparationGeneration;
  const provider = selectedProvider;
  agentSession = { status: 'starting', provider };
  broadcast({ type: 'agent_session', ...agentSession });
  prepareAgentSession({ provider, model: selectedModel, reasoningEffort: selectedReasoningEffort,
    fastMode: selectedFastMode, conversationId: activeConversationIds[provider], cwd: process.cwd() })
    .then(({ conversationId, pid }) => {
      if (generation !== preparationGeneration) return;
      activeConversationIds[provider] = conversationId;
      agentSession = { status: 'ready', provider, conversationId, pid };
      broadcast({ type: 'agent_session', ...agentSession });
    }).catch((error) => {
      if (generation !== preparationGeneration) return;
      agentSession = { status: 'error', provider, error: error.message };
      broadcast({ type: 'agent_session', ...agentSession });
      console.warn(`[Session] ${provider}: ${error.message}`);
    });
}

function syncAgentSettings({ provider, model, reasoningEffort, fastMode, candidateContext: context }) {
  if (typeof context === 'string') candidateContext = context.trim().slice(0, 6000);
  const changed = (provider && provider !== selectedProvider) || (model && model !== selectedModel)
    || (reasoningEffort && reasoningEffort !== selectedReasoningEffort)
    || (fastMode !== undefined && !!fastMode !== selectedFastMode);
  if (changed) {
    liveCopilot.cancel();
    if (activeAgentProcess) {
      activeAgentProcess.kill();
      activeAgentProcess = null;
      broadcast({ type: 'agent_aborted' });
    }
    closeAgentSession(selectedProvider);
    preparationKey = null;
    preparationGeneration++;
  }
  if (provider) selectedProvider = provider;
  if (model) selectedModel = model;
  if (reasoningEffort) selectedReasoningEffort = reasoningEffort;
  if (fastMode !== undefined) selectedFastMode = !!fastMode;
  prepareSelectedSession();
}

function resetAgentSession(provider) {
  liveCopilot.cancel();
  activeAgentProcess?.kill();
  activeAgentProcess = null;
  preparationGeneration++;
  preparationKey = null;
  closeAgentSession(provider);
  if (provider && activeConversationIds[provider] !== undefined) activeConversationIds[provider] = null;
  else {
    activeConversationIds.antigravity = null;
    activeConversationIds.codex = null;
  }
  pcTranscription.cancel();
  systemAudioEngine.discardSpeech();
  lastPcTranscript = '';
  broadcast({ type: 'session_reset', activeConversationIds, timestamp: Date.now() });
  prepareSelectedSession();
}

// Wire up Linux System Audio loopback engine
let lastLevelBroadcast = 0;
systemAudioEngine.on('level', ({ level, rms }) => {
  const now = Date.now();
  if (now - lastLevelBroadcast >= 45) {
    lastLevelBroadcast = now;
    broadcast({ type: 'pc_audio_level', level, rms });
  }
});

const liveCopilot = createLiveCopilot({
  enabled: () => autoRespond,
  canStart: () => !activeAgentProcess,
  start: ({ text, utteranceId, isPreview, onSettled }) => triggerCopilotForText(text, {
    replyId: `copilot-pc-${utteranceId}`, isPreview, onSettled,
  }),
  onFinalized: (id) => broadcast({ type: 'copilot_finalized', replyId: `copilot-pc-${id}` }),
  onDiscarded: (id) => broadcast({ type: 'copilot_discarded', replyId: `copilot-pc-${id}` }),
});

const pcTranscription = wirePcTranscription(systemAudioEngine, {
  transcribe: transcribeAudioBuffer,
  getLanguage: () => activeLanguage,
  broadcast,
  onPartial: (text, id) => liveCopilot.partial(text, id),
  onCancel: (id) => liveCopilot.cancel(id),
  onFinal: (text, id) => {
    lastPcTranscript = text;
    liveCopilot.final(text, id);
  },
});

systemAudioEngine.on('status', (status) => {
  broadcast({ type: 'pc_capture_status', ...status });
});

function triggerCopilotForText(transcript, overrideOptions = {}) {
  if (!transcript?.trim()) return;

  if (activeAgentProcess) {
    activeAgentProcess.kill();
    activeAgentProcess = null;
  }
  const generation = ++copilotGeneration;
  const replyId = overrideOptions.replyId || `copilot-${Date.now()}-${generation}`;
  const isPreview = () => typeof overrideOptions.isPreview === 'function'
    ? overrideOptions.isPreview() : !!overrideOptions.isPreview;
  let settled = false;
  const settle = (result) => {
    if (settled) return;
    settled = true;
    overrideOptions.onSettled?.(result);
  };

  const provider = overrideOptions.provider || selectedProvider || 'antigravity';
  const model = overrideOptions.model || selectedModel || (provider === 'codex' ? 'gpt-6-luna' : 'gemini-3.8-flash');
  const persona = overrideOptions.persona || selectedPersona;
  const reasoningEffort = overrideOptions.reasoningEffort || selectedReasoningEffort || 'medium';
  const fastMode = overrideOptions.fastMode !== undefined ? overrideOptions.fastMode : selectedFastMode;
  const convId = activeConversationIds[provider] || null;

  broadcast({
    type: 'copilot_started',
    replyId, isPreview: isPreview(),
    prompt: transcript,
    provider,
    model,
    persona,
    timestamp: Date.now(),
  });

  const processHandle = generateCopilotResponse({
    transcript,
    provider,
    model,
    persona,
    reasoningEffort,
    fastMode,
    conversationId: convId,
    isPreview: isPreview(),
    candidateContext,
    cwd: process.cwd(),
    onToken: (token, fullText) => {
      if (generation !== copilotGeneration || settled) return;
      broadcast({
        type: 'copilot_token',
        replyId, isPreview: isPreview(),
        token,
        fullText,
        provider,
        model,
      });
    },
    onError: (err) => {
      if (generation !== copilotGeneration || settled) return;
      broadcast({ type: 'copilot_error', replyId, error: err.message, provider, model });
      activeAgentProcess = null;
      settle({ error: err.message });
    },
    onComplete: (response, resConvId) => {
      if (generation !== copilotGeneration || settled) return;
      if (resConvId) activeConversationIds[provider] = resConvId;
      broadcast({
        type: 'copilot_completed',
        replyId, isPreview: isPreview(),
        prompt: transcript,
        response,
        provider,
        model,
        persona,
        conversationId: resConvId,
        timestamp: Date.now(),
      });
      activeAgentProcess = null;
      settle({ response });
    },
  });
  activeAgentProcess = {
    pid: processHandle.pid,
    kill() {
      if (settled) return;
      if (generation === copilotGeneration) {
        copilotGeneration++;
        activeAgentProcess = null;
        broadcast({ type: 'copilot_cancelled', replyId });
      }
      processHandle.kill();
      settle({ cancelled: true });
    },
  };
  return activeAgentProcess;
}

// REST endpoints
app.get('/api/status', (req, res) => {
  const agyBin = process.env.AGY_BIN || '/home/paulo/.local/bin/agy';
  const codexBin = process.env.CODEX_BIN || '/usr/bin/codex';
  const hasAgy = fs.existsSync(agyBin);
  const hasCodex = fs.existsSync(codexBin);

  res.json({
    status: 'online',
    agyAvailable: hasAgy,
    agyBinPath: agyBin,
    codexAvailable: hasCodex,
    codexBinPath: codexBin,
    cwd: process.cwd(),
    selectedProvider,
    selectedModel,
    activeConversationIds,
    agentSession,
    isProcessing: activeAgentProcess !== null,
  });
});

app.post('/api/reset-session', (req, res) => {
  resetAgentSession(req.body?.provider);
  res.json({ success: true, message: 'Sessão reiniciada com sucesso', activeConversationIds });
});

app.get('/api/candidate-context/file', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { status, ...body } = await readCandidateContext(path.resolve(__dirname, '..'));
  res.status(status).json(body);
});

app.post('/api/settings', (req, res) => {
  const { provider, model, reasoningEffort, fastMode, candidateContext } = req.body || {};
  syncAgentSettings({ provider, model, reasoningEffort, fastMode, candidateContext });
  broadcast({
    type: 'settings_synced',
    provider: selectedProvider,
    model: selectedModel,
    reasoningEffort: selectedReasoningEffort,
    fastMode: selectedFastMode,
  });
  res.json({
    success: true,
    provider: selectedProvider,
    model: selectedModel,
    reasoningEffort: selectedReasoningEffort,
    fastMode: selectedFastMode,
  });
});

// System Audio Capture & Devices Endpoints
app.get('/api/audio-devices', (req, res) => {
  res.json(SystemAudioEngine.listAudioSinks());
});

app.post('/api/audio-capture/start', (req, res) => {
  const { sink, vadThreshold } = req.body || {};
  const success = systemAudioEngine.startCapture({ sink, vadThreshold });
  res.json({ success, status: systemAudioEngine.getStatus() });
});

app.post('/api/audio-capture/stop', (req, res) => {
  systemAudioEngine.stopCapture();
  res.json({ success: true, status: systemAudioEngine.getStatus() });
});

app.get('/api/audio-capture/status', (req, res) => {
  res.json(systemAudioEngine.getStatus());
});

app.get('/api/models', (req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    selectedProvider,
    selectedModel,
    selectedPersona,
    autoRespond,
  });
});

app.post('/api/copilot/trigger', (req, res) => {
  const text = req.body?.text || lastPcTranscript;
  if (!text) return res.status(400).json({ error: 'Nenhum texto para responder' });
  liveCopilot.cancel();
  triggerCopilotForText(text, req.body || {});
  res.json({ success: true, text });
});

// Audio transcription endpoint (Universal fallback using python/ffmpeg)
app.post(
  '/api/transcribe',
  express.raw({
    type: ['audio/*', 'application/octet-stream', 'video/webm'],
    limit: '30mb',
  }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Nenhum áudio recebido' });
    }
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const result = await transcribeAudioBuffer(req.body, req.query.lang || 'pt-BR', { signal: controller.signal });
    if (!controller.signal.aborted) res.json(result);
  }
);

// REST Fallback for sending a prompt
app.post('/api/message', (req, res) => {
  liveCopilot.cancel();
  const {
    text,
    source,
    provider = 'antigravity',
    model,
    reasoningEffort,
    fastMode = true,
  } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  if (activeAgentProcess) {
    activeAgentProcess.kill();
    activeAgentProcess = null;
  }

  let finalResponse = '';
  const convId = activeConversationIds[provider];

  activeAgentProcess = runUnifiedAgent({
    provider,
    model,
    reasoningEffort,
    fastMode,
    prompt: text.trim(),
    conversationId: convId,
    cwd: process.cwd(),
    onMessage: (eventData) => {
      if (eventData.result?.response) {
        finalResponse = eventData.result.response;
      }
      if (eventData.conversation_id) {
        activeConversationIds[provider] = eventData.conversation_id;
      }
    },
    onError: (err) => {
      activeAgentProcess = null;
      res.status(500).json({ error: err.message });
    },
    onClose: (code) => {
      activeAgentProcess = null;
      res.json({
        success: true,
        response: finalResponse,
        code,
        provider,
        model,
        conversationId: activeConversationIds[provider],
      });
    },
  });
});

// Catch-all route to serve SPA index.html
if (fs.existsSync(distPath)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp} on path ${req.url}`);

  // Send current status on connect
  ws.send(
    JSON.stringify({
      type: 'connection_ack',
      agentSession,
      conversationIds: activeConversationIds,
      isProcessing: activeAgentProcess !== null,
      selectedProvider,
      selectedModel,
      selectedReasoningEffort,
      selectedFastMode,
      selectedPersona,
      autoRespond,
      pcAudioStatus: systemAudioEngine.getStatus(),
      availableModels: AVAILABLE_MODELS,
      availablePersonas: AVAILABLE_PERSONAS,
      availableSinks: SystemAudioEngine.listAudioSinks(),
    })
  );

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleClientMessage(ws, data);
    } catch (err) {
      console.error('[WS] Invalid JSON message:', err);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Client connection error:', err);
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

function handleClientMessage(ws, data) {
  const { type } = data;

  if (type === 'reset_session') {
    resetAgentSession(data.provider);
    return;
  }

  // Linux PC Audio Loopback commands
  if (type === 'start_pc_capture') {
    const success = systemAudioEngine.startCapture(data.options || {});
    broadcast({ type: 'pc_capture_status', ...systemAudioEngine.getStatus() });
    return;
  }

  if (type === 'stop_pc_capture') {
    systemAudioEngine.stopCapture();
    broadcast({ type: 'pc_capture_status', ...systemAudioEngine.getStatus() });
    return;
  }

  if (type === 'sync_settings') {
    syncAgentSettings(data);
    broadcast({
      type: 'settings_synced',
      provider: selectedProvider,
      model: selectedModel,
      reasoningEffort: selectedReasoningEffort,
      fastMode: selectedFastMode,
    });
    return;
  }

  if (type === 'set_provider') {
    liveCopilot.cancel();
    if (data.provider) {
      syncAgentSettings({ provider: data.provider });
      broadcast({ type: 'provider_changed', provider: selectedProvider });
    }
    return;
  }

  if (type === 'set_model') {
    liveCopilot.cancel();
    if (data.model) {
      syncAgentSettings({ model: data.model });
      broadcast({ type: 'model_changed', model: selectedModel });
    }
    return;
  }

  if (type === 'set_persona') {
    liveCopilot.cancel();
    if (data.persona) {
      selectedPersona = data.persona;
      broadcast({ type: 'persona_changed', persona: selectedPersona });
    }
    return;
  }

  if (type === 'set_auto_respond') {
    autoRespond = !!data.autoRespond;
    if (!autoRespond) liveCopilot.cancel();
    broadcast({ type: 'auto_respond_changed', autoRespond });
    return;
  }

  if (type === 'trigger_copilot') {
    liveCopilot.cancel();
    const text = data.text || lastPcTranscript;
    triggerCopilotForText(text, {
      provider: data.provider,
      model: data.model,
      persona: data.persona,
      reasoningEffort: data.reasoningEffort,
      fastMode: data.fastMode,
    });
    return;
  }

  if (type === 'set_language') {
    if (data.language) activeLanguage = data.language;
    return;
  }

  if (type === 'voice_message' || type === 'text_message') {
    liveCopilot.cancel();
    const prompt = data.text?.trim();
    if (!prompt) {
      ws.send(JSON.stringify({ type: 'error', error: 'Mensagem vazia' }));
      return;
    }

    const provider = data.provider || selectedProvider || 'antigravity';
    const model = data.model || selectedModel || (provider === 'codex' ? 'gpt-6-luna' : 'gemini-3.8-flash');
    const reasoningEffort = data.reasoningEffort || selectedReasoningEffort || 'medium';
    const fastMode = data.fastMode !== undefined ? data.fastMode : selectedFastMode;
    const currentConvId = activeConversationIds[provider] || null;

    if (activeAgentProcess) {
      console.log('[WS] Aborting previous running process for new prompt...');
      activeAgentProcess.kill();
      activeAgentProcess = null;
    }

    // Broadcast user message to UI
    ws.send(
      JSON.stringify({
        type: 'user_message_acknowledged',
        text: prompt,
        timestamp: Date.now(),
        source: data.source || 'voice',
        provider,
        model,
        reasoningEffort,
        fastMode,
      })
    );

    // Notify agent is starting
    ws.send(
      JSON.stringify({
        type: 'agent_status',
        status: 'thinking',
        prompt,
        provider,
        model,
        reasoningEffort,
        fastMode,
      })
    );

    activeAgentProcess = runUnifiedAgent({
      provider,
      model,
      reasoningEffort,
      fastMode,
      prompt,
      conversationId: currentConvId,
      cwd: process.cwd(),
      onMessage: (eventData) => {
        if (eventData.conversation_id) {
          activeConversationIds[provider] = eventData.conversation_id;
        }
        if (eventData.step_update?.conversation_id) {
          activeConversationIds[provider] = eventData.step_update.conversation_id;
        }
        if (eventData.result?.conversation_id) {
          activeConversationIds[provider] = eventData.result.conversation_id;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_stream',
              data: eventData,
              provider,
              model,
              reasoningEffort,
              fastMode,
            })
          );
        }
      },
      onError: (err) => {
        console.error('[Bridge Error]:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_error',
              error: err.message,
              provider,
              model,
            })
          );
        }
        activeAgentProcess = null;
      },
      onClose: (code) => {
        activeAgentProcess = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_done',
              code,
              provider,
              model,
              conversationId: activeConversationIds[provider],
            })
          );
        }
      },
    });
  } else if (type === 'abort') {
    liveCopilot.cancel();
    if (activeAgentProcess) {
      activeAgentProcess.kill();
      activeAgentProcess = null;
      ws.send(JSON.stringify({ type: 'agent_aborted' }));
    }
  } else if (type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    liveCopilot.cancel();
    activeAgentProcess?.kill();
    closeAgentSession();
    systemAudioEngine.stopCapture();
    process.exit(0);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Perssua Code Server] Running on http://localhost:${PORT}`);
  console.log(`[Perssua Code Server] WebSocket ready on ws://localhost:${PORT}`);
  prepareSelectedSession();
});
