import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemAudioEngine } from './system-audio-engine.js';
import { wirePcTranscription } from './pc-transcription.js';

// A streaming recognizer double: the test decides what it hears and when.
function fakeLive({ available = true, result = { text: 'Como você organiza o cache?', language: 'pt-BR' } } = {}) {
  const live = {
    streams: [], warmed: [], closed: 0,
    available: () => available,
    warm: (language) => live.warmed.push(language),
    close: () => { live.closed++; },
    start(options) {
      const stream = {
        options, audio: [], cancelled: false,
        write: (pcm) => stream.audio.push(pcm),
        finish: async () => stream.result,
        cancel: () => { stream.cancelled = true; },
        result,
      };
      live.streams.push(stream);
      return stream;
    },
  };
  return live;
}

function pipeline({ live = fakeLive(), transcribe = async () => { throw new Error('the windowed recognizer must not run'); }, language = 'auto', copilotPartialMs = 2000 } = {}) {
  const engine = new SystemAudioEngine();
  const events = [];
  const partials = [];
  const finals = [];
  const cancelled = [];
  const transcription = wirePcTranscription(engine, {
    transcribe, live, getLanguage: () => language, copilotPartialMs,
    broadcast: (event) => events.push(event),
    onPartial: (text) => partials.push(text),
    onFinal: (text) => finals.push(text),
    onCancel: (id) => cancelled.push(id),
  });
  return { engine, live, events, partials, finals, cancelled, transcription };
}

function pcm(amplitude) {
  const buffer = Buffer.alloc(1600);
  for (let offset = 0; offset < buffer.length; offset += 2) buffer.writeInt16LE(amplitude, offset);
  return buffer;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const speak = (engine, frames) => { for (let i = 0; i < frames; i++) engine.processPcmChunk(pcm(4000)); };

test('with a streaming recognizer, every PCM frame of the utterance is streamed and the final comes from it', async () => {
  const app = pipeline();
  app.engine.processPcmChunk(pcm(0)); // lead-in kept before the speech starts
  speak(app.engine, 70);
  for (let i = 0; i < 4; i++) app.engine.processPcmChunk(pcm(0)); // the pause is streamed too
  app.engine.finishSpeechSegment();
  await tick();
  const [stream] = app.live.streams;
  assert.equal(stream.options.language, 'auto');
  assert.equal(stream.audio.length, 75);
  assert.deepEqual(app.finals, ['Como você organiza o cache?']);
  const transcribed = app.events.find((event) => event.type === 'pc_speech_transcribed');
  assert.equal(transcribed.language, 'pt-BR');
  assert.ok(transcribed.durationSec > 3);
  assert.deepEqual(app.events.filter((event) => event.type === 'pc_speech_partial'), [], 'no windowed partials');
});

test('streamed partials reach the screen at once, the live responder at a steady pace', async () => {
  const app = pipeline({ copilotPartialMs: 60 });
  speak(app.engine, 2);
  const { onPartial } = app.live.streams[0].options;
  onPartial('Como', { settled: false });
  onPartial('Como você organiza o', { settled: false });
  onPartial('Como você organiza o cache', { settled: false });
  onPartial('Como você organiza o cache quando', { settled: false });
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_partial').length, 4);
  assert.deepEqual(app.partials, ['Como', 'Como você organiza o'], 'a short partial does not start the pacing window');
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.deepEqual(app.partials.slice(2), ['Como você organiza o cache quando'], 'only the latest text is sent when the window ends');
  onPartial('Como você organiza o cache quando escala?', { settled: true });
  assert.equal(app.partials.at(-1), 'Como você organiza o cache quando escala?', 'a pause is never held back');
  app.transcription.cancel();
});

test('if the stream fails, the utterance is finished by the standard recognizer from the buffered audio', async () => {
  const requests = [];
  const live = fakeLive({ result: { error: 'A conexão com a Deepgram foi encerrada (1006).' } });
  const app = pipeline({
    live,
    language: 'en-US',
    transcribe: async (wav, language) => {
      requests.push({ bytes: wav.length, language, riff: wav.toString('ascii', 0, 4) });
      return { text: 'How do you scale the cache?', language: 'en-US' };
    },
  });
  speak(app.engine, 40);
  live.streams[0].options.onError('A conexão com a Deepgram foi encerrada (1006).');
  speak(app.engine, 20); // still buffered after the failure
  app.engine.finishSpeechSegment();
  await tick();
  await tick();
  assert.deepEqual(requests, [{ bytes: 44 + 60 * 1600, language: 'en-US', riff: 'RIFF' }]);
  assert.equal(live.streams[0].audio.length, 40, 'nothing more goes to a failed stream');
  assert.deepEqual(app.finals, ['How do you scale the cache?']);
  assert.equal(app.events.find((event) => event.type === 'pc_speech_transcribed').language, 'en-US');
});

test('without a usable key the windowed recognizer handles the utterance as before', async () => {
  const live = fakeLive({ available: false });
  const app = pipeline({ live, transcribe: async () => ({ text: 'Trecho reconhecido', language: 'pt-BR' }) });
  speak(app.engine, 30);
  app.engine.finishSpeechSegment();
  await tick();
  await tick();
  assert.equal(live.streams.length, 0);
  assert.deepEqual(app.finals, ['Trecho reconhecido']);
});

test('an empty stream ends with an explicit PC error and no response', async () => {
  const app = pipeline({ live: fakeLive({ result: { text: '', language: null } }) });
  speak(app.engine, 30);
  app.engine.finishSpeechSegment();
  await tick();
  const id = app.events.find((event) => event.type === 'pc_speech_start').utteranceId;
  assert.ok(app.events.some((event) => event.type === 'pc_speech_error' && event.utteranceId === id));
  assert.deepEqual(app.cancelled, [id]);
  assert.deepEqual(app.finals, []);
});

test('a discarded click and a stopped capture cancel their streams', async () => {
  const app = pipeline();
  speak(app.engine, 3); // shorter than minSpeechMs
  app.engine.finishSpeechSegment();
  assert.equal(app.live.streams[0].cancelled, true);

  speak(app.engine, 30);
  app.engine.stopCapture();
  await tick();
  assert.equal(app.live.streams[1].cancelled, true);
  assert.deepEqual(app.finals, []);
  assert.equal(app.live.closed, 1, 'the warm connection is closed with the capture');
});

test('starting the capture opens a warm connection in the current language', () => {
  const app = pipeline({ language: 'en-US' });
  app.engine.emit('status', { isCapturing: true });
  assert.deepEqual(app.live.warmed, ['en-US']);
});

test('the language heard in the last utterance is preferred by the next one', async () => {
  const app = pipeline({ live: fakeLive({ result: { text: 'Tell me about yourself.', language: 'en-US' } }) });
  speak(app.engine, 30);
  app.engine.finishSpeechSegment();
  await tick();
  speak(app.engine, 30);
  assert.equal(app.live.streams[1].options.preferred, 'en-US');
  app.transcription.cancel();
});
