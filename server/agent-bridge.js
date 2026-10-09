import { spawn } from 'child_process';
import readline from 'readline';
import { runCodexAgent, prepareCodexSession, closeCodexSession } from './codex-session.js';
export { runCodexAgent, closeCodexSession } from './codex-session.js';

let warmAgySession = null;

function disposeAgySession(session) {
  if (!session || session.disposed) return;
  session.disposed = true;
  if (session.active) session.active.done = true;
  session.active = null;
  clearTimeout(session.readyTimer);
  session.rejectReady?.(new Error('Sessão encerrada'));
  session.reader?.close();
  session.child.kill('SIGTERM');
  if (warmAgySession === session) warmAgySession = null;
}

export function closeAgySession() {
  disposeAgySession(warmAgySession);
}

process.on('exit', closeAgySession);
process.on('exit', closeCodexSession);

/** Start the CLI without submitting a model turn. */
function getAgySession({ conversationId, model = 'gemini-3.8-flash', reasoningEffort = 'high', cwd = process.cwd() }, reusePrepared = false) {
  const agyBin = process.env.AGY_BIN || '/home/paulo/.local/bin/agy';

  const key = JSON.stringify([agyBin, cwd, model, reasoningEffort]);
  let session = warmAgySession;
  if (!session || session.disposed || session.active || session.key !== key
    || (conversationId ? session.conversationId !== conversationId : !(reusePrepared || session.prepared))) {
    disposeAgySession(session);
    const args = [
      '--input-format', 'stream-json', '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
    ];
    if (model) args.push('--model', model);
    if (reasoningEffort) args.push('--effort', reasoningEffort);
    if (conversationId) args.push('--conversation', conversationId);
    console.log(`[AGY] Starting streaming session (model=${model}, effort=${reasoningEffort})`);
    const child = spawn(agyBin, args, {
      cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PAGER: 'cat' },
    });
    session = { child, key, conversationId, active: null, disposed: false, prepared: true };
    session.ready = new Promise((resolve, reject) => { session.resolveReady = resolve; session.rejectReady = reject; });
    session.ready.catch(() => {});
    warmAgySession = session;
    const current = session;
    const fail = (error) => {
      if (current.disposed) return;
      const turn = current.active;
      current.rejectReady(error);
      disposeAgySession(current);
      turn?.onError?.(error);
    };
    current.reader = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    current.reader.on('line', (line) => {
      if (current.disposed || !line.trim()) return;
      let data;
      try { data = JSON.parse(line); }
      catch { data = { event: 'raw_log', text: line }; }
      const id = data.conversation_id || data.step_update?.conversation_id || data.result?.conversation_id;
      if (id) current.conversationId = id;
      if (data.event === 'init') {
        clearTimeout(current.readyTimer);
        current.resolveReady({ pid: child.pid, conversationId: current.conversationId });
      }
      const turn = current.active;
      if (!turn) return;
      if (data.event === 'result' && (data.result?.error || data.result?.status !== 'SUCCESS')) {
        fail(new Error(data.result?.error || `Antigravity: ${data.result?.status || 'resultado inválido'}`));
        return;
      }
      if (data.event === 'result') {
        // The CLI reports cumulative session counters. The app displays each
        // response's own time and usage, excluding time spent waiting for input.
        const cumulativeUsage = data.result.usage;
        const usage = cumulativeUsage && Object.fromEntries(Object.entries(cumulativeUsage).map(([name, value]) => [
          name, typeof value === 'number' ? Math.max(0, value - (current.lastUsage?.[name] || 0)) : value,
        ]));
        current.lastUsage = cumulativeUsage;
        data = { ...data, result: { ...data.result, usage, duration_seconds: (Date.now() - turn.startedAt) / 1000 } };
      }
      turn.onMessage?.(data);
      if (data.event === 'result' && current.active === turn) {
        turn.done = true;
        current.active = null;
        turn.onClose?.(0);
      }
    });
    child.stderr.on('data', (chunk) => {
      if (!current.disposed) current.active?.onMessage?.({ event: 'agent_stderr', text: chunk.toString() });
    });
    current.readyTimer = setTimeout(() => fail(new Error('Antigravity demorou demais para iniciar')), 30000);
    current.readyTimer.unref();
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('close', (code) => {
      if (!current.disposed) fail(new Error(`Antigravity encerrou antes de concluir a resposta (código ${code})`));
    });
  } else {
    console.log('[AGY] Reusing streaming session');
  }
  return session;
}

export function prepareAgySession(options = {}) {
  try { return getAgySession(options, true).ready; }
  catch (error) { return Promise.reject(error); }
}

export function runAgyAgent({ onMessage, onError, onClose, prompt, ...options }) {
  let session;
  try { session = getAgySession(options); }
  catch (error) {
    queueMicrotask(() => onError?.(error));
    return { kill() {} };
  }
  session.prepared = false;
  const turn = { onMessage, onError, onClose, done: false, startedAt: Date.now() };
  session.active = turn;
  session.child.stdin.write(JSON.stringify({ event: 'user', message: { content: prompt } }) + '\n');
  return {
    pid: session.child.pid,
    kill() {
      // An old completed handle must never cancel a newer turn on this process.
      if (!turn.done && session.active === turn) disposeAgySession(session);
    },
  };
}

export function prepareAgentSession(options) {
  return options.provider === 'codex' ? prepareCodexSession(options) : prepareAgySession(options);
}

export function closeAgentSession(provider) {
  if (!provider || provider === 'antigravity') closeAgySession();
  if (!provider || provider === 'codex') closeCodexSession();
}

/**
 * Unified runner that dispatches to either Antigravity or Codex.
 */
export function runUnifiedAgent(options) {
  if (options.provider === 'codex') {
    return runCodexAgent(options);
  }
  return runAgyAgent(options);
}
