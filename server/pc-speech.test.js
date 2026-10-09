import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemAudioEngine } from './system-audio-engine.js';
import { wirePcTranscription } from './pc-transcription.js';

function pipeline(transcribeAudioBuffer, autoRespond = true) {
  const engine = new SystemAudioEngine();
  const events = [];
  const prompts = [];
  const transcription = wirePcTranscription(engine, {
    transcribe: transcribeAudioBuffer,
    getLanguage: () => 'pt-BR',
    broadcast: (event) => events.push(event),
    onFinal: (text) => { if (autoRespond) prompts.push(text); },
  });
  return { engine, events, prompts, transcription };
}

function pcm(amplitude) {
  const buffer = Buffer.alloc(1600);
  for (let offset = 0; offset < buffer.length; offset += 2) buffer.writeInt16LE(amplitude, offset);
  return buffer;
}

test('PC speech goes through transcription and automatically reaches the model', async () => {
  const app = pipeline(async (wav, language) => {
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(language, 'pt-BR');
    return { text: ' Como resolvo esse problema? ' };
  });
  app.engine.processPcmChunk(pcm(1100));
  for (let frame = 0; frame < 20; frame += 1) app.engine.processPcmChunk(pcm(500));
  app.engine.finishSpeechSegment();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(app.prompts, ['Como resolvo esse problema?']);
  assert.deepEqual(app.events.map((event) => event.type), ['pc_speech_start', 'pc_speech_end', 'pc_speech_processing', 'pc_speech_transcribed']);
});

for (const [name, result] of [
  ['recognition failure', async () => ({ error: 'Não foi possível entender o áudio' })],
  ['empty recognition', async () => ({ text: ' ' })],
  ['unexpected exception', async () => { throw new Error('Serviço indisponível'); }],
]) {
  test(`${name} always finishes with an explicit PC error`, async () => {
    const app = pipeline(result);
    app.engine.emit('speech_segment', { wavBuffer: Buffer.alloc(44), durationSec: 1, timestamp: Date.now() });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(app.events.map((event) => event.type), ['pc_speech_processing', 'pc_speech_error']);
    assert.ok(app.events[1].error);
    assert.equal(app.prompts.length, 0);
  });
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('PC speech exposes recognized partials to the live responder before any silence', async () => {
  const engine = new SystemAudioEngine();
  const prompts = [];
  const transcription = wirePcTranscription(engine, {
    transcribe: async () => ({ text: 'Como resolvo esse problema no servidor?' }),
    getLanguage: () => 'pt-BR', broadcast() {},
    onPartial: (text, utteranceId) => prompts.push({ text, utteranceId }),
    onFinal() {},
  });
  for (let frame = 0; frame < 60; frame++) engine.processPcmChunk(pcm(4000));
  await tick();
  assert.equal(engine.inSpeech, true);
  assert.equal(prompts.length, 1, 'the live responder must receive text while the PC is still speaking');
  assert.equal(prompts[0].utteranceId, engine.utteranceId);
  engine.stopCapture();
  transcription.cancel();
});

test('PC starts recognition while speaking and only responds after the pause', async () => {
  let calls = 0;
  const app = pipeline(async () => ({ text: ++calls === 1 ? 'Como resolvo esse problema' : 'esse problema no servidor?' }));
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  assert.equal(app.engine.inSpeech, true);
  assert.equal(calls, 1);
  assert.equal(app.events.at(-1).type, 'pc_speech_partial');
  assert.deepEqual(app.prompts, []);
  for (let frame = 0; frame < 20; frame++) app.engine.processPcmChunk(pcm(4000));
  app.engine.finishSpeechSegment();
  await tick();
  assert.equal(calls, 2);
  assert.deepEqual(app.prompts, ['Como resolvo esse problema no servidor?']);
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_transcribed').length, 1);
});

test('stopping PC capture suppresses in-flight recognition and automatic responses', async () => {
  let complete;
  let signal;
  const app = pipeline((_, __, options) => {
    signal = options.signal;
    return new Promise((resolve) => { complete = resolve; });
  });
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  app.engine.stopCapture();
  assert.equal(signal.aborted, true);
  complete({ text: 'Resultado antigo' });
  await tick();
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_partial').length, 0);
  assert.deepEqual(app.prompts, []);
});

test('a failed partial is not resurrected by the final tail', async () => {
  let calls = 0;
  const app = pipeline(async () => { calls++; return { error: 'Sem conexão' }; });
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  for (let frame = 0; frame < 20; frame++) app.engine.processPcmChunk(pcm(4000));
  app.engine.finishSpeechSegment();
  await tick();
  assert.equal(calls, 1);
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_error').length, 1);
  assert.deepEqual(app.prompts, []);
});

test('manual mode still transcribes live without automatically invoking the agent', async () => {
  const app = pipeline(async () => ({ text: 'Pergunta da reunião' }), false);
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  app.engine.finishSpeechSegment();
  await tick();
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_partial').length, 1);
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_transcribed').length, 1);
  assert.deepEqual(app.prompts, []);
});

test('consecutive turns preserve recognition order and capture language per utterance', async () => {
  const engine = new SystemAudioEngine();
  const requests = [];
  const finals = [];
  let language = 'pt-BR';
  wirePcTranscription(engine, {
    getLanguage: () => language,
    transcribe: (_, lang) => new Promise((resolve) => requests.push({ resolve, lang })),
    broadcast() {}, onFinal: (text) => finals.push(text),
  });
  engine.emit('speech_segment', { utteranceId: 'a', sequence: 0, wavBuffer: Buffer.alloc(44), durationSec: 1 });
  language = 'en-US';
  engine.emit('speech_segment', { utteranceId: 'b', sequence: 0, wavBuffer: Buffer.alloc(44), durationSec: 1 });
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].lang, 'pt-BR');
  requests[0].resolve({ text: 'Primeira fala' });
  await tick();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].lang, 'en-US');
  requests[1].resolve({ text: 'Second turn' });
  await tick();
  assert.deepEqual(finals, ['Primeira fala', 'Second turn']);
});

test('an unrecognized short window recovers with adjacent audio instead of rejecting the whole PC phrase', async () => {
  const app = pipeline(async (wav) => {
    const duration = (wav.length - 44) / 32000;
    return duration >= 3.9
      ? { text: 'Como resolvo esse problema no servidor?' }
      : { error: 'Não foi possível entender o áudio', code: 'unrecognized' };
  });
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  for (let frame = 0; frame < 20; frame++) app.engine.processPcmChunk(pcm(4000));
  app.engine.finishSpeechSegment();
  await tick();
  assert.deepEqual(app.events.filter((event) => event.type === 'pc_speech_error'), []);
  assert.deepEqual(app.prompts, ['Como resolvo esse problema no servidor?']);
});

test('an unrecognized final tail is retried with the previous window without repeating partial text', async () => {
  const lengths = [];
  const app = pipeline(async (wav) => {
    const duration = (wav.length - 44) / 32000;
    lengths.push(duration);
    if (duration >= 3.9) return { text: 'Como resolvo esse problema no servidor?' };
    if (duration === 2) return { text: 'Como resolvo esse problema' };
    return { error: 'Não foi possível entender o áudio', code: 'unrecognized' };
  });
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  assert.equal(app.events.at(-1).type, 'pc_speech_partial');
  assert.deepEqual(app.prompts, []);
  for (let frame = 0; frame < 20; frame++) app.engine.processPcmChunk(pcm(4000));
  app.engine.finishSpeechSegment();
  await tick();
  assert.deepEqual(lengths, [2, 2.8, 4]);
  assert.deepEqual(app.prompts, ['Como resolvo esse problema no servidor?']);
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_error').length, 0);
});

test('unrecognized audio stays bounded and cannot produce an incomplete agent prompt', async () => {
  let largest = 0;
  const app = pipeline(async (wav) => {
    largest = Math.max(largest, (wav.length - 44) / 32000);
    return { error: 'Não foi possível entender o áudio', code: 'unrecognized' };
  });
  for (let window = 0; window < 6; window++) {
    for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
    await tick();
  }
  app.engine.finishSpeechSegment();
  await tick();
  assert.ok(largest <= 10);
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_error').length, 1);
  assert.deepEqual(app.prompts, []);
});

test('stopping capture while waiting for context discards the held audio', async () => {
  let calls = 0;
  const app = pipeline(async () => {
    calls++;
    return { error: 'Não foi possível entender o áudio', code: 'unrecognized' };
  });
  for (let frame = 0; frame < 60; frame++) app.engine.processPcmChunk(pcm(4000));
  await tick();
  assert.equal(app.events.filter((event) => event.type === 'pc_speech_error').length, 0);
  app.engine.stopCapture();
  await tick();
  assert.equal(calls, 1);
  assert.deepEqual(app.prompts, []);
});
