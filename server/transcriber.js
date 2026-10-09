import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, 'transcribe.py');

/**
 * Transcribes an audio Buffer (WAV, WEBM, etc.) into text using Python speech recognition.
 * @param {Buffer} audioBuffer
 * @param {string} language - e.g. 'pt-BR' or 'en-US'
 * @returns {Promise<{ text?: string, error?: string }>}
 */
export async function transcribeAudioBuffer(audioBuffer, language = 'pt-BR', { timeoutMs = 30000, signal } = {}) {
  if (signal?.aborted) return { error: 'Transcrição cancelada' };
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `pc_audio_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`);

    try {
      fs.writeFileSync(tmpFile, audioBuffer);
    } catch (writeErr) {
      console.error('[Transcriber] Failed to write temporary audio file:', writeErr);
      return resolve({ error: writeErr.message });
    }

    const child = spawn('python3', [scriptPath, tmpFile, language]);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const cleanup = () => {
      for (const file of [tmpFile, `${tmpFile}.converted.wav`]) {
        try { fs.unlinkSync(file); } catch {}
      }
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      cleanup();
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ error: 'A transcrição demorou demais. Verifique a conexão e tente novamente' });
    }, timeoutMs);
    const abort = () => {
      child.kill('SIGKILL');
      finish({ error: 'Transcrição cancelada' });
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (settled) return;

      try {
        const parsed = JSON.parse(stdout.trim());
        finish(parsed);
      } catch (e) {
        console.warn('[Transcriber] JSON parse error from transcribe.py:', stderr || stdout);
        finish({
          error: 'Falha ao interpretar transcrição',
          details: stderr || stdout,
        });
      }
    });

    child.on('error', (err) => {
      console.error('[Transcriber] Failed to spawn transcribe.py:', err);
      finish({ error: err.message });
    });
  });
}
