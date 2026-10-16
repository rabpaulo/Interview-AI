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
import { createSessionTranscript } from './session-transcript.js';
import { buildSummaryPrompt, createSummaryService, saveSessionMarkdown, sessionMarkdown } from './session-summary.js';
import { buildAgentPrompt } from './agent-prompt.js';
import { normalizeImages, imageDataUrl, SCREENSHOT_PROMPT } from './agent-images.js';
import { AVAILABLE_MODELS, AVAILABLE_PERSONAS, generateCopilotResponse } from './gemini-copilot.js';
import { AUTO_LANGUAGE, LANGUAGES } from '../shared/language.js';
import { unavailableReason } from '../shared/provider-availability.js';
import { createProviderAvailability } from './provider-availability.js';
import { providerKeys } from './provider-keys.js';
import { resetApiConversations } from './api-session.js';
import { API_PROVIDER_IDS, isApiProvider } from '../shared/api-providers.js';

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

const PROVIDER_IDS = ['antigravity', 'codex', 'claude', 'opencode', ...API_PROVIDER_IDS];
const activeConversationIds = Object.fromEntries(PROVIDER_IDS.map((id) => [id, null]));
const DEFAULT_MODELS = {
  antigravity: 'gemini-3.8-flash',
  codex: 'gpt-6-luna',
  claude: 'claude-sonnet-5-5',
};
// OpenCode and the API providers have no fixed list: their first listed model is the default.
function defaultModelFor(provider) {
  return DEFAULT_MODELS[provider] || providerAvailability.state()[provider]?.models?.[0] || null;
}
let activeAgentProcess = null;
let copilotGeneration = 0;
let agentTurnCounter = 0;

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
const sessionTranscript = createSessionTranscript();
// Summary settings come from the client. No provider means the conversation's model.
let summarySettings = { auto: true, provider: null, model: null, saveOnReset: true };

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
    // Also retries a failed start once the recheck it triggered finds the provider usable.
    const blocked = blockedReason(selectedProvider, selectedModel);
    if (blocked || agentSession.status === 'unavailable' || agentSession.status === 'error') {
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
  if (!provider || isApiProvider(provider)) resetApiConversations();
  if (provider && activeConversationIds[provider] !== undefined) activeConversationIds[provider] = null;
  else {
    for (const name of Object.keys(activeConversationIds)) activeConversationIds[name] = null;
  }
  pcTranscription.cancel();
  systemAudioEngine.discardSpeech();
  lastPcTranscript = '';
  conversationMemory.clear();
  archiveSession();
  sessionTranscript.clear();
  summaryService.reset();
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

function summaryConfig() {
  const provider = summarySettings.provider || selectedProvider;
  const model = summarySettings.provider
    ? summarySettings.model || defaultModelFor(provider)
    : selectedModel;
  return { auto: summarySettings.auto, provider, model, fastMode: selectedFastMode, error: blockedReason(provider, model) };
}

const summaryService = createSummaryService({
  transcript: sessionTranscript,
  config: summaryConfig,
  // A throwaway CLI process: the live conversation never sees the summary request.
  run: (options) => runIsolatedAgent({ ...options, timeoutMs: 180000, cwd: agentWorkspace() }),
  canAutoStart: () => !activeAgentProcess,
  onUpdate: (summary) => broadcast({ type: 'summary_update', summary }),
});

function recordTranscript(role, text, options) {
  if (sessionTranscript.add(role, text, options)) summaryService.noteActivity();
}

function sessionsDir() {
  return path.join(path.dirname(profileStore.file), 'sessions');
}

// "Nova sessão" keeps the finished session as Markdown, summarizing it first when
// the summary on screen does not cover the last lines.
function archiveSession() {
  const entries = sessionTranscript.entries();
  if (!summarySettings.saveOnReset || entries.filter((entry) => entry.role !== 'assistant').length < 2) return;
  const startedAt = sessionTranscript.startedAt;
  const current = summaryService.current();
  const config = summaryConfig();
  let summary;
  if (current) summary = Promise.resolve(current);
  else if (config.error) summary = Promise.reject(new Error(config.error));
  else {
    summary = runIsolatedAgent({
      prompt: buildSummaryPrompt({ entries, startedAt, previous: summaryService.basis(), final: true }),
      provider: config.provider, model: config.model, reasoningEffort: 'medium', fastMode: config.fastMode,
      timeoutMs: 180000, cwd: agentWorkspace(),
    }).then((text) => ({ text, model: config.model }));
  }
  summary
    .catch((error) => {
      console.warn(`[Summary] Final summary failed, saving the transcript only: ${error.message}`);
      return null;
    })
    .then((result) => saveSessionMarkdown(sessionsDir(),
      sessionMarkdown({ entries, startedAt, summary: result?.text, model: result?.model }), startedAt))
    .then((file) => {
      console.log(`[Summary] Saved finished session to ${file}`);
      broadcast({ type: 'summary_saved', file, archived: true });
    })
    .catch((error) => {
      console.error(`[Summary] Could not save the finished session: ${error.message}`);
      broadcast({ type: 'summary_save_error', error: error.message });
    });
}

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
    recordTranscript('interlocutor', text);
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
  // PC utterances were recorded when transcribed; this is a typed or repeated trigger.
  if (!overrideOptions.utteranceId && transcript !== lastPcTranscript) recordTranscript('interlocutor', transcript);

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
  const model = overrideOptions.model || selectedModel || defaultModelFor(provider);
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
      recordTranscript('assistant', response, { id: replyId });
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

// API keys: the client sends a key once and only ever gets back whether one exists.
function keysResponse() {
  return { keys: providerKeys.summary(), file: providerKeys.file };
}

// A new key changes what the provider, and OpenCode with it, can offer.
function refreshForKeys(provider) {
  providerAvailability.refresh(provider, { force: true });
  providerAvailability.refresh('opencode', { force: true });
}

app.get('/api/provider-keys', (req, res) => res.json(keysResponse()));

app.put('/api/provider-keys/:provider', (req, res) => {
  const { provider } = req.params;
  if (!isApiProvider(provider)) return res.status(404).json({ error: 'Provedor desconhecido.' });
  try {
    providerKeys.set(provider, req.body?.key);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  refreshForKeys(provider);
  res.json(keysResponse());
});

app.delete('/api/provider-keys/:provider', (req, res) => {
  const { provider } = req.params;
  if (!isApiProvider(provider)) return res.status(404).json({ error: 'Provedor desconhecido.' });
  try {
    providerKeys.remove(provider);
  } catch (error) {
    return res.status(500).json({ error: `Não foi possível remover a key: ${error.message}` });
  }
  refreshForKeys(provider);
  res.json(keysResponse());
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

// Saves the current session (summary and full transcript) as Markdown in the app's
// sessions folder or in the connected Obsidian vault.
app.post('/api/summary/export', async (req, res) => {
  const target = req.body?.target === 'vault' ? 'vault' : 'sessions';
  const entries = sessionTranscript.entries();
  if (!entries.length) return res.status(400).json({ error: 'Ainda não há nada para salvar nesta sessão.' });
  const vault = notesVault.status;
  if (target === 'vault' && !(vault.connected && vault.path)) {
    return res.status(400).json({ error: 'Conecte uma vault do Obsidian para salvar nela.' });
  }
  const { text, model } = summaryService.state;
  const dir = target === 'vault' ? path.join(vault.path, 'InterviewAI') : sessionsDir();
  try {
    const file = await saveSessionMarkdown(dir,
      sessionMarkdown({ entries, startedAt: sessionTranscript.startedAt, summary: text, model }), sessionTranscript.startedAt);
    console.log(`[Summary] Exported session to ${file}`);
    res.json({ file });
  } catch (error) {
    console.error(`[Summary] Export failed: ${error.message}`);
    res.status(500).json({ error: 'Não foi possível salvar o arquivo.' });
  }
});

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
  recordTranscript('user', turn.memory);

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
      recordTranscript('assistant', finalResponse);
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
      summary: summaryService.state,
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

  if (type === 'summary_request') {
    summaryService.request('manual');
    return;
  }

  if (type === 'summary_settings') {
    const { auto, provider, model, saveOnReset } = data.settings || {};
    summarySettings = {
      auto: auto !== undefined ? !!auto : summarySettings.auto,
      provider: provider === undefined ? summarySettings.provider : PROVIDER_IDS.includes(provider) ? provider : null,
      model: model === undefined ? summarySettings.model : (typeof model === 'string' && model) || null,
      saveOnReset: saveOnReset !== undefined ? !!saveOnReset : summarySettings.saveOnReset,
    };
    summaryService.refresh();
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
    const model = data.model || selectedModel || defaultModelFor(provider);
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
    recordTranscript('user', turn.memory);
    // Every event of this turn names it, so the client streams into the right message.
    const turnId = `turn-${Date.now()}-${++agentTurnCounter}`;
    let replyText = '';
    const notes = turn.images.length && !data.text?.trim() ? [] : notesVault.search(prompt);
    ws.send(
      JSON.stringify({
        type: 'user_message_acknowledged',
        turnId,
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
        if (eventData.step_update?.text_delta) replyText += eventData.step_update.text_delta;
        if (typeof eventData.result?.response === 'string' && eventData.result.response) replyText = eventData.result.response;

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_stream',
              turnId,
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
              turnId,
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
        recordTranscript('assistant', replyText, { id: turnId });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_done',
              turnId,
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
