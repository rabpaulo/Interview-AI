// Explicitly invoked diagnostic: streams a recording to Deepgram at real-time pace,
// exactly as the PC capture does, and reports how far the transcript lags behind
// the audio. Uses the saved key (or DEEPGRAM_API_KEY) and is billed by Deepgram.
//
//   node scripts/measure-transcription-latency.js gravacao.wav [pt-BR|en-US|auto]
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { createDeepgramTranscriber } from '../server/deepgram-transcriber.js';
import { providerKeys } from '../server/provider-keys.js';

const [file, language = 'auto'] = process.argv.slice(2);
const key = providerKeys.get('deepgram');
if (!file || !key) {
  console.error(file ? 'Configure a key da Deepgram no app ou em DEEPGRAM_API_KEY.' : 'Uso: node scripts/measure-transcription-latency.js <áudio> [pt-BR|en-US|auto]');
  process.exit(2);
}

const decoded = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
if (decoded.status !== 0) {
  console.error(String(decoded.stderr) || 'ffmpeg falhou');
  process.exit(2);
}
const pcm = decoded.stdout;
const FRAME = 1600; // 50 ms, the engine's frame size

let started = 0;
const lags = [];
// Each result says which stretch of audio it covers; its arrival minus the end of
// that stretch is how late the words appeared on screen.
const connect = (url, apiKey) => {
  const socket = new WebSocket(url, { headers: { Authorization: `Token ${apiKey}` } });
  socket.on('message', (data, isBinary) => {
    if (isBinary || !started) return;
    const message = JSON.parse(String(data));
    if (message.type !== 'Results' || !message.channel?.alternatives?.[0]?.transcript) return;
    const audioEndMs = (message.start + message.duration) * 1000;
    lags.push(performance.now() - started - audioEndMs);
  });
  return socket;
};

const transcriber = createDeepgramTranscriber({ getKey: () => key, connect });
const warming = performance.now();
transcriber.warm(language);
while (transcriber.status().status !== 'available') {
  if (performance.now() - warming > 8000) throw new Error(transcriber.status().reason || 'A conexão não abriu');
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const connectMs = Math.round(performance.now() - warming);

let firstPartialMs = null;
let partials = 0;
const stream = transcriber.start({
  language,
  onPartial: (text) => {
    partials++;
    firstPartialMs ??= Math.round(performance.now() - started);
    process.stdout.write(`\r\x1b[K${text.slice(-110)}`);
  },
  onError: (error) => console.error(`\n${error}`),
});
started = performance.now();
for (let offset = 0, frame = 0; offset < pcm.length; offset += FRAME, frame++) {
  stream.write(pcm.subarray(offset, offset + FRAME));
  const due = started + (frame + 1) * 50;
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, due - performance.now())));
}
const finishing = performance.now();
const result = await stream.finish();
const finalMs = Math.round(performance.now() - finishing);
transcriber.close();

const sorted = lags.filter((lag) => lag >= 0).sort((a, b) => a - b);
const pick = (q) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]) : null);
console.log(`\n${JSON.stringify({
  audioSec: Number((pcm.length / 32000).toFixed(1)), language, detected: result.language, connectMs,
  firstPartialMs, partials, lagMedianMs: pick(0.5), lagP95Ms: pick(0.95), finalAfterFinalizeMs: finalMs,
  error: result.error,
}, null, 2)}`);
process.exit(result.error ? 1 : 0);
