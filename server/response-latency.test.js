import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemAudioEngine } from './system-audio-engine.js';
import { wirePcTranscription } from './pc-transcription.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function pcm(amplitude) {
  const buffer = Buffer.alloc(1600);
  for (let i = 0; i < buffer.length; i += 2) buffer.writeInt16LE(amplitude, i);
  return buffer;
}

test('recognition overlaps the end-of-speech pause without starting an early AI response', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const engine = new SystemAudioEngine();
  const requests = [];
  const finals = [];
  const transcription = wirePcTranscription(engine, {
    getLanguage: () => 'pt-BR', broadcast() {},
    transcribe: async () => {
      requests.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { text: 'Como resolvo esse problema?' };
    },
    onFinal: (text) => finals.push({ text, time: Date.now() }),
  });
  try {
    // A short utterance has no earlier three-second window to pre-transcribe.
    for (let i = 0; i < 20; i++) engine.processPcmChunk(pcm(4000));
    for (let i = 0; i < 18; i++) {
      engine.processPcmChunk(pcm(0));
      t.mock.timers.tick(50);
      await tick();
      if (i < 17) assert.deepEqual(finals, [], 'AI must wait for the complete pause');
    }
    assert.equal(finals.length, 1, 'the final should be ready when the 900ms pause ends');
    assert.equal(finals[0].time, 1900);
    assert.equal(requests.length, 1, 'the final must reuse recognition instead of requesting it again');
  } finally {
    engine.stopCapture();
    transcription.cancel();
  }
});

test('speech resuming during the pause remains one complete response', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const engine = new SystemAudioEngine();
  const finals = [];
  let calls = 0;
  const transcription = wirePcTranscription(engine, {
    getLanguage: () => 'pt-BR', broadcast() {},
    transcribe: async () => ({ text: ++calls === 1 ? 'Como resolvo esse problema' : 'esse problema no servidor?' }),
    onFinal: (text) => finals.push(text),
  });
  try {
    for (let i = 0; i < 20; i++) engine.processPcmChunk(pcm(4000));
    for (let i = 0; i < 10; i++) {
      engine.processPcmChunk(pcm(0));
      t.mock.timers.tick(50);
      await tick();
    }
    assert.equal(calls, 1);
    for (let i = 0; i < 20; i++) {
      engine.processPcmChunk(pcm(4000));
      t.mock.timers.tick(50);
      await tick();
    }
    assert.deepEqual(finals, []);
    for (let i = 0; i < 18; i++) {
      engine.processPcmChunk(pcm(0));
      t.mock.timers.tick(50);
      await tick();
    }
    assert.equal(calls, 2);
    assert.deepEqual(finals, ['Como resolvo esse problema no servidor?']);
  } finally {
    engine.stopCapture();
    transcription.cancel();
  }
});

test('short clicks and stopped capture do not start speculative recognition', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const engine = new SystemAudioEngine();
  let calls = 0;
  engine.on('speech_chunk', () => calls++);
  engine.on('speech_segment', () => calls++);
  engine.processPcmChunk(pcm(4000));
  engine.processPcmChunk(pcm(0));
  t.mock.timers.tick(900);
  assert.equal(calls, 0);
  for (let i = 0; i < 20; i++) engine.processPcmChunk(pcm(4000));
  engine.processPcmChunk(pcm(0));
  engine.stopCapture();
  t.mock.timers.tick(900);
  assert.equal(calls, 0);
});

test('stopping capture during early recognition aborts it and ignores late text', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const engine = new SystemAudioEngine();
  const finals = [];
  const partials = [];
  let complete;
  let signal;
  const transcription = wirePcTranscription(engine, {
    getLanguage: () => 'pt-BR',
    broadcast: (event) => { if (event.type === 'pc_speech_partial') partials.push(event.text); },
    transcribe: (_, __, options) => {
      signal = options.signal;
      return new Promise((resolve) => { complete = resolve; });
    },
    onFinal: (text) => finals.push(text),
  });
  for (let i = 0; i < 20; i++) engine.processPcmChunk(pcm(4000));
  engine.processPcmChunk(pcm(0));
  t.mock.timers.tick(300);
  await tick();
  engine.stopCapture();
  assert.equal(signal.aborted, true);
  complete({ text: 'Resultado atrasado' });
  t.mock.timers.tick(900);
  await tick();
  assert.deepEqual(finals, []);
  assert.deepEqual(partials, []);
  transcription.cancel();
});

test('continuous PC speech sends its first recognition window within two seconds', (t) => {
  const engine = new SystemAudioEngine();
  const windows = [];
  engine.on('speech_chunk', (chunk) => windows.push(chunk));
  t.after(() => engine.stopCapture());
  for (let i = 0; i < 40; i++) engine.processPcmChunk(pcm(4000));
  assert.equal(windows.length, 1, 'waiting three seconds before recognition makes the first AI text unnecessarily late');
  assert.equal(windows[0].wavBuffer.readUInt32LE(40), 64000);
});
