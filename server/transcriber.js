import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { resolvePython } from './cli-process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, 'transcribe.py');

/**
 * Speech recognition through one long-lived `transcribe.py --serve` process.
 * Starting Python and importing SpeechRecognition for every chunk cost 100-200 ms
 * each time; the worker pays it once and answers concurrent requests by id.
 * A worker that exits (or never starts) fails its pending requests; the next
 * request starts a new one.
 */
export function createTranscriber({ python = () => resolvePython(), script = scriptPath, spawnImpl = spawn } = {}) {
  let worker = null;
  let nextId = 0;

  function start() {
    const { command, args } = python();
    const child = spawnImpl(command, [...args, script, '--serve'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Python on Windows defaults stdout to the ANSI code page, which breaks accents in the JSON.
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const state = { child, pending: new Map(), lastOutput: 0 };
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      state.lastOutput = Date.now();
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch {
          console.warn('[Transcriber] Unreadable line from transcribe.py:', line.slice(0, 200));
          continue;
        }
        const { id, ...result } = message;
        state.pending.get(id)?.answer(result);
      }
    });
    child.stderr.on('data', (data) => {
      const text = String(data).trim();
      if (text) console.warn('[Transcriber] transcribe.py:', text.slice(0, 500));
    });
    child.stdin.on('error', () => {}); // a dead worker is reported by 'close'
    const stop = (reason) => {
      if (worker === state) worker = null;
      for (const request of [...state.pending.values()]) request.answer({ error: reason });
    };
    child.on('error', (error) => {
      console.error('[Transcriber] Failed to start transcribe.py:', error.message);
      stop(error.message);
    });
    child.on('close', (code) => stop(`O reconhecimento de voz foi encerrado (código ${code})`));
    // An idle worker must not keep the app (or a test) running.
    child.unref();
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.unref?.();
    return state;
  }

  /**
   * @param {Buffer} audioBuffer WAV, WEBM, etc.
   * @param {string} language e.g. 'pt-BR', or 'pt-BR,en-US' to detect which one was spoken
   * @returns {Promise<{ text?: string, language?: string, error?: string, code?: string }>}
   */
  function transcribe(audioBuffer, language = 'pt-BR', { timeoutMs = 30000, signal } = {}) {
    if (signal?.aborted) return Promise.resolve({ error: 'Transcrição cancelada' });
    const file = path.join(os.tmpdir(), `pc_audio_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);
    try {
      fs.writeFileSync(file, audioBuffer);
    } catch (error) {
      console.error('[Transcriber] Failed to write temporary audio file:', error);
      return Promise.resolve({ error: error.message });
    }
    worker ||= start();
    const state = worker;
    const id = ++nextId;
    const sentAt = Date.now();

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(result);
      };
      // The file stays until the worker is done with it, even if the caller gave up.
      state.pending.set(id, {
        answer(result) {
          state.pending.delete(id);
          try { fs.unlinkSync(file); } catch {}
          settle(result);
        },
      });
      const timer = setTimeout(() => {
        // Silence since this request was sent means the worker itself is stuck.
        if (state.lastOutput < sentAt) state.child.kill('SIGKILL');
        settle({ error: 'A transcrição demorou demais. Verifique a conexão e tente novamente' });
      }, timeoutMs);
      const abort = () => settle({ error: 'Transcrição cancelada' });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        state.child.stdin.write(`${JSON.stringify({ id, file, language })}\n`);
      } catch (error) {
        state.pending.get(id)?.answer({ error: error.message });
      }
    });
  }

  return {
    transcribe,
    /** Starts the worker ahead of the first utterance. */
    warm() { worker ||= start(); },
    close() {
      worker?.child.kill();
      worker = null;
    },
  };
}

const shared = createTranscriber();
export const transcribeAudioBuffer = shared.transcribe;
export const warmTranscriber = shared.warm;
