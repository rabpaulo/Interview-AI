import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runUnifiedAgent, runIsolatedAgent, prepareAgentSession, closeAgentSession } from './agent-bridge.js';
import { importDocument, ImportError, MAX_IMPORT_BYTES } from './document-import.js';
import { systemAudioEngine, SystemAudioEngine } from './system-audio-engine.js';
import { transcribeAudioBuffer } from './transcriber.js';
import { wirePcTranscription } from './pc-transcription.js';
import { createLiveCopilot } from './live-copilot.js';
import { readCandidateContext } from './candidate-context.js';
import { createProfileStore, defaultProfilePath } from './profile-store.js';
import { createNotesVault, createNotesLookup, publicHit } from './notes-vault.js';
import { agentWorkspace, cliAvailable, resolveCliBin } from './cli-process.js';
import { composeCandidateContext, MAX_CONTEXT_CHARS } from '../shared/candidate-profile.js';
import { createConversationMemory } from './conversation-memory.js';
import { buildAgentPrompt } from './agent-prompt.js';
import { normalizeImages, imageDataUrl, SCREENSHOT_PROMPT } from './agent-images.js';
import { AVAILABLE_MODELS, AVAILABLE_PERSONAS, generateCopilotResponse } from './gemini-copilot.js';
import { AUTO_LANGUAGE, LANGUAGES } from '../shared/language.js';
import { unavailableReason } from '../shared/provider-availability.js';
import { createProviderAvailability } from './provider-availability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
  claude: null,
};
const DEFAULT_MODELS = {
  antigravity: 'gemini-3.8-flash',
  codex: 'gpt-6-luna',
  claude: 'claude-sonnet-5-5',
};
let activeAgentProcess = null;
let copilotGeneration = 0;

let selectedProvider = 'antigravity';
let selectedModel = 'gemini-3.8-flash';
let selectedReasoningEffort = 'medium';
let selectedFastMode = true;
let selectedPersona = 'general';
const profileStore = createProfileStore();
let candidateProfile = await profileStore.load();
let candidateContext = composeCandidateContext(candidateProfile);
console.log(`[Profile] Using ${profileStore.file}`);
let autoRespond = true;
let lastPcTranscript = '';
let activeLanguage = AUTO_LANGUAGE;
const conversationMemory = createConversationMemory();

// Local Obsidian vault search. It runs on partial transcripts, so by the time an
// utterance is final its notes are already on screen and ready for the prompt.
const notesVault = createNotesVault({
  configFile: process.env.INTERVIEWAI_NOTES_CONFIG || path.join(path.dirname(defaultProfilePath()), 'notes.json'),
});
notesVault.load();
const notesLookup = createNotesLookup({
  search: (text) => notesVault.search(text),
  onHits: (utteranceId, hits) => broadcast({ type: 'notes_hits', utteranceId, hits }),
});

// A screenshot sent without text gets a default request; memory keeps only a marker for the image.
function readUserTurn({ text, images }) {
  const typed = typeof text === 'string' ? text.trim() : '';
  const attached = normalizeImages(images);
  return {
    images: attached,
    request: typed || (attached.length ? SCREENSHOT_PROMPT : ''),
    display: typed || (attached.length ? 'Captura de tela' : ''),
    memory: attached.length ? `[captura de tela anexada] ${typed}`.trim() : typed,
  };
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Login and account models of each CLI. An unavailable provider or model is never
// started; the client receives the reason and offers only usable options.
const providerAvailability = createProviderAvailability({
  onChange: (availability, provider) => {
    broadcast({ type: 'provider_availability', availability });
    if (provider !== selectedProvider || activeAgentProcess) return;
    const blocked = blockedReason(selectedProvider, selectedModel);
    if (blocked || agentSession.status === 'unavailable') {
      preparationKey = null;
      prepareSelectedSession();
    }
  },
});

function blockedReason(provider, model) {
  const name = AVAILABLE_MODELS.find((entry) => entry.id === model)?.name;
  return unavailableReason(providerAvailability.state(), provider, model, name);
}

// Session preparation is independent of response generation and never sends a prompt.
let preparationGeneration = 0;
let preparationKey = null;
let agentSession = { status: 'starting', provider: selectedProvider };
function prepareSelectedSession() {
  if (activeAgentProcess) return;
  const provider = selectedProvider;
  const blocked = blockedReason(provider, selectedModel);
  if (blocked) {
    preparationKey = null;
    preparationGeneration++;
    closeAgentSession(provider);
    agentSession = { status: 'unavailable', provider, error: blocked };
    broadcast({ type: 'agent_session', ...agentSession });
    return;
  }
  const key = JSON.stringify([selectedProvider, selectedModel, selectedReasoningEffort, selectedFastMode]);
  if (preparationKey === key && agentSession.status !== 'error') return;
  preparationKey = key;
  const generation = ++preparationGeneration;
  agentSession = { status: 'starting', provider };
  broadcast({ type: 'agent_session', ...agentSession });
  prepareAgentSession({ provider, model: selectedModel, reasoningEffort: selectedReasoningEffort,
    fastMode: selectedFastMode, conversationId: activeConversationIds[provider], cwd: agentWorkspace() })
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
      // A logout or a model removed from the account shows up as a failed start.
      providerAvailability.refresh(provider);
    });
}

function syncAgentSettings({ provider, model, reasoningEffort, fastMode }) {
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
    for (const name of Object.keys(activeConversationIds)) activeConversationIds[name] = null;
  }
  pcTranscription.cancel();
  systemAudioEngine.discardSpeech();
  lastPcTranscript = '';
  conversationMemory.clear();
  notesLookup.clear();
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
    replyId: `copilot-pc-${utteranceId}`, utteranceId, isPreview, onSettled,
  }),
  onFinalized: (id) => broadcast({ type: 'copilot_finalized', replyId: `copilot-pc-${id}` }),
  onDiscarded: (id) => broadcast({ type: 'copilot_discarded', replyId: `copilot-pc-${id}` }),
});

const pcTranscription = wirePcTranscription(systemAudioEngine, {
  transcribe: transcribeAudioBuffer,
  getLanguage: () => activeLanguage,
  broadcast,
  onPartial: (text, id) => {
    notesLookup.lookup(id, text);
    liveCopilot.partial(text, id);
  },
  onCancel: (id) => liveCopilot.cancel(id),
  onFinal: (text, id) => {
    lastPcTranscript = text;
    conversationMemory.remember('interlocutor', text);
    notesLookup.lookup(id, text);
    liveCopilot.final(text, id);
  },
});

systemAudioEngine.on('status', (status) => {
  broadcast({ type: 'pc_capture_status', ...status });
});

function triggerCopilotForText(transcript, overrideOptions = {}) {
  if (!transcript?.trim()) return;
  conversationMemory.remember('interlocutor', transcript);

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
  const model = overrideOptions.model || selectedModel || (DEFAULT_MODELS[provider] || DEFAULT_MODELS.antigravity);
  const persona = overrideOptions.persona || selectedPersona;
  const reasoningEffort = overrideOptions.reasoningEffort || selectedReasoningEffort || 'medium';
  const fastMode = overrideOptions.fastMode !== undefined ? overrideOptions.fastMode : selectedFastMode;
  const convId = activeConversationIds[provider] || null;
  // PC utterances already showed their notes card through notes_hits.
  const notes = notesLookup.lookup(overrideOptions.utteranceId || null, transcript);

  broadcast({
    type: 'copilot_started',
    replyId, isPreview: isPreview(),
    prompt: transcript,
    ...(overrideOptions.utteranceId ? {} : { notes: notes.map(publicHit) }),
    provider,
    model,
    persona,
    timestamp: Date.now(),
  });
  const blocked = blockedReason(provider, model);
  if (blocked) {
    broadcast({ type: 'copilot_error', replyId, error: blocked, provider, model });
    settle({ error: blocked });
    return null;
  }

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
    recentTurns: conversationMemory.beforeQuestion(transcript),
    notes,
    cwd: agentWorkspace(),
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
      providerAvailability.refresh(provider);
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
  const agyBin = resolveCliBin('agy');
  const codexBin = resolveCliBin('codex');
  const claudeBin = resolveCliBin('claude');

  res.json({
    status: 'online',
    platform: process.platform,
    agyAvailable: cliAvailable(agyBin),
    agyBinPath: agyBin,
    codexAvailable: cliAvailable(codexBin),
    codexBinPath: codexBin,
    claudeAvailable: cliAvailable(claudeBin),
    claudeBinPath: claudeBin,
    cwd: process.cwd(),
    selectedProvider,
    selectedModel,
    activeConversationIds,
    agentSession,
    providerAvailability: providerAvailability.state(),
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

app.get('/api/profile', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ profile: candidateProfile, file: profileStore.file });
});

app.put('/api/profile', async (req, res) => {
  const profile = req.body?.profile;
  if (!profile || typeof profile !== 'object') return res.status(400).json({ error: 'Perfil inválido.' });
  const context = composeCandidateContext(profile);
  if (context.length > MAX_CONTEXT_CHARS) {
    return res.status(400).json({ error: `O contexto ultrapassa ${MAX_CONTEXT_CHARS.toLocaleString('pt-BR')} caracteres. Reduza alguns campos.` });
  }
  try {
    candidateProfile = await profileStore.save(profile);
    candidateContext = composeCandidateContext(candidateProfile);
    res.json({ profile: candidateProfile, file: profileStore.file });
  } catch (error) {
    console.error(`[Profile] Could not save ${profileStore.file}: ${error.message}`);
    res.status(500).json({ error: 'Não foi possível salvar o perfil no disco.' });
  }
});

// Fills profile fields from a résumé (kind=cv) or job post (kind=job). Nothing is saved:
// the editor merges the fields into its draft and the user reviews before saving.
app.post(
  '/api/profile/import',
  express.raw({ type: () => true, limit: MAX_IMPORT_BYTES }),
  async (req, res) => {
    const kind = req.query.kind;
    let filename = '';
    try { filename = decodeURIComponent(String(req.get('x-file-name') || '')); } catch {}
    try {
      const result = await importDocument({
        kind,
        buffer: req.body,
        filename,
        // A throwaway CLI process, so the interview conversation never sees the document.
        runAgent: (prompt) => runIsolatedAgent({
          provider: selectedProvider, model: selectedModel, reasoningEffort: 'low', fastMode: true,
          prompt, cwd: agentWorkspace(),
        }),
      });
      console.log(`[Profile] Imported ${kind} from "${filename}" (${result.chars} chars${result.warning ? ', fallback' : ''})`);
      res.json(result);
    } catch (error) {
      if (!(error instanceof ImportError)) console.error(`[Profile] Import failed: ${error.message}`);
      res.status(error.status || 500).json({ error: error instanceof ImportError ? error.message : 'Não foi possível importar o arquivo.' });
    }
  }
);

function notesError(res, error) {
  if (!error.status) console.error(`[Notes] ${error.message}`);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível indexar a vault.', status: notesVault.status });
}

app.get('/api/notes', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: notesVault.status });
});

app.put('/api/notes', async (req, res) => {
  try {
    res.json({ status: await notesVault.connect(req.body?.path) });
  } catch (error) {
    notesError(res, error);
  }
});

app.post('/api/notes/reindex', async (req, res) => {
  try {
    res.json({ status: await notesVault.reindex() });
  } catch (error) {
    notesError(res, error);
  }
});

app.delete('/api/notes', async (req, res) => {
  try {
    res.json({ status: await notesVault.disconnect() });
  } catch (error) {
    notesError(res, error);
  }
});

// Lets the settings screen check what a question would retrieve.
app.get('/api/notes/search', (req, res) => {
  const started = performance.now();
  const hits = notesVault.search(String(req.query.q || '')).map(publicHit);
  res.json({ hits, ms: Number((performance.now() - started).toFixed(1)) });
});

app.post('/api/settings', (req, res) => {
  const { provider, model, reasoningEffort, fastMode } = req.body || {};
  syncAgentSettings({ provider, model, reasoningEffort, fastMode });
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
  res.json(SystemAudioEngine.listAudioSinks(systemAudioEngine.source));
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
    const requested = String(req.query.lang || 'pt-BR').split(',').filter((language) => LANGUAGES.includes(language));
    const result = await transcribeAudioBuffer(req.body, requested.join(',') || 'pt-BR', { signal: controller.signal });
    if (!controller.signal.aborted) res.json(result);
  }
);

// REST Fallback for sending a prompt
app.post('/api/message', (req, res) => {
  liveCopilot.cancel();
  const {
    provider = 'antigravity',
    model,
    reasoningEffort,
    fastMode = true,
  } = req.body;
  const turn = readUserTurn(req.body);

  if (!turn.request) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }
  const blocked = blockedReason(provider, model || selectedModel);
  if (blocked) return res.status(409).json({ error: blocked, provider, model });

  if (activeAgentProcess) {
    activeAgentProcess.kill();
    activeAgentProcess = null;
  }

  let finalResponse = '';
  const convId = activeConversationIds[provider];
  conversationMemory.remember('user', turn.memory);

  activeAgentProcess = runUnifiedAgent({
    provider,
    model,
    reasoningEffort,
    fastMode,
    prompt: buildAgentPrompt(turn.request, candidateProfile, notesVault.search(turn.request)),
    images: turn.images,
    conversationId: convId,
    cwd: agentWorkspace(),
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
      providerAvailability: providerAvailability.state(),
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
      availableSinks: SystemAudioEngine.listAudioSinks(systemAudioEngine.source),
    })
  );

  ws.on('message', (message, isBinary) => {
    // Binary frames carry PC audio (PCM16 mono 16 kHz) captured by the renderer on Windows.
    if (isBinary) {
      systemAudioEngine.pushPcm(message);
      return;
    }
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

  if (type === 'refresh_providers') {
    providerAvailability.refresh(data.provider, { force: true });
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
    if (data.language === AUTO_LANGUAGE || LANGUAGES.includes(data.language)) activeLanguage = data.language;
    return;
  }

  if (type === 'voice_message' || type === 'text_message') {
    liveCopilot.cancel();
    const turn = readUserTurn(data);
    const prompt = turn.request;
    if (!prompt) {
      ws.send(JSON.stringify({ type: 'error', error: 'Mensagem vazia' }));
      return;
    }

    const provider = data.provider || selectedProvider || 'antigravity';
    const model = data.model || selectedModel || (DEFAULT_MODELS[provider] || DEFAULT_MODELS.antigravity);
    const reasoningEffort = data.reasoningEffort || selectedReasoningEffort || 'medium';
    const fastMode = data.fastMode !== undefined ? data.fastMode : selectedFastMode;
    const currentConvId = activeConversationIds[provider] || null;
    const blocked = blockedReason(provider, model);
    if (blocked) {
      ws.send(JSON.stringify({ type: 'agent_unavailable', error: blocked, provider, model }));
      return;
    }

    if (activeAgentProcess) {
      console.log('[WS] Aborting previous running process for new prompt...');
      activeAgentProcess.kill();
      activeAgentProcess = null;
    }

    // Broadcast user message to UI
    conversationMemory.remember('user', turn.memory);
    const notes = turn.images.length && !data.text?.trim() ? [] : notesVault.search(prompt);
    ws.send(
      JSON.stringify({
        type: 'user_message_acknowledged',
        text: turn.display,
        images: turn.images.map(imageDataUrl),
        timestamp: Date.now(),
        source: data.source || 'voice',
        notes: notes.map(publicHit),
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
      prompt: buildAgentPrompt(prompt, candidateProfile, notes),
      images: turn.images,
      conversationId: currentConvId,
      cwd: agentWorkspace(),
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
        providerAvailability.refresh(provider);
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
    notesVault.close();
    process.exit(0);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[InterviewAI Server] Running on http://localhost:${PORT}`);
  console.log(`[InterviewAI Server] WebSocket ready on ws://localhost:${PORT}`);
  prepareSelectedSession();
  providerAvailability.refresh();
});
