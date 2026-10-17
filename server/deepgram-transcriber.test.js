import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { createDeepgramTranscriber, detectLanguage, listenUrl, requestLanguage } from './deepgram-transcriber.js';

// A stand-in for wss://api.deepgram.com/v1/listen that answers like the real API:
// interim results while audio arrives, a final one when Finalize is sent.
async function fakeDeepgram({ reply = defaultReply, reject = null } = {}) {
  const connections = [];
  const server = new WebSocketServer({
    port: 0,
    verifyClient: reject ? (_info, done) => done(false, reject) : undefined,
  });
  server.on('connection', (socket, request) => {
    const connection = { url: new URL(request.url, 'ws://localhost'), auth: request.headers.authorization, audio: 0, control: [], socket };
    connections.push(connection);
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        connection.audio += data.length;
        return reply(connection, { audio: data });
      }
      const message = JSON.parse(String(data));
      connection.control.push(message.type);
      if (message.type === 'CloseStream') socket.close(1000);
      else reply(connection, { control: message.type });
    });
  });
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    url: `ws://127.0.0.1:${server.address().port}/v1/listen`,
    connections,
    close: () => new Promise((resolve) => {
      for (const client of server.clients) client.terminate();
      server.close(resolve);
    }),
  };
}

const results = (transcript, { isFinal = false, speechFinal = false, fromFinalize = false, words = [] } = {}) => JSON.stringify({
  type: 'Results', is_final: isFinal, speech_final: speechFinal, from_finalize: fromFinalize,
  channel: { alternatives: [{ transcript, words }] },
});

// Every 100 ms of audio reveals one more word; Finalize commits all of them.
function defaultReply(connection, { audio, control }) {
  const words = ['Como', 'você', 'organiza', 'o', 'cache?'];
  if (audio) {
    const heard = Math.min(words.length, Math.floor(connection.audio / 3200));
    if (heard && heard !== connection.heard) {
      connection.heard = heard;
      connection.socket.send(results(words.slice(0, heard).join(' ')));
    }
  }
  if (control === 'Finalize') {
    connection.socket.send(results(words.slice(0, connection.heard).join(' '), {
      isFinal: true, fromFinalize: true,
      words: words.slice(0, connection.heard).map((word) => ({ word, language: 'pt' })),
    }));
  }
}

const frame = () => Buffer.alloc(1600, 1); // 50 ms
const until = async (condition, ms = 2000) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

test('auto mode streams pt-BR and en-US together; a fixed language is sent as is', () => {
  assert.equal(requestLanguage('auto'), 'multi');
  assert.equal(requestLanguage('en-US'), 'en-US');
  const url = new URL(listenUrl('multi'));
  assert.equal(url.searchParams.get('model'), 'nova-3');
  assert.equal(url.searchParams.get('interim_results'), 'true');
  assert.equal(url.searchParams.get('encoding'), 'linear16');
  assert.equal(url.searchParams.get('sample_rate'), '16000');
  assert.equal(detectLanguage({ 'en-US': 3, 'pt-BR': 5 }, 'en-US'), 'pt-BR');
  assert.equal(detectLanguage({ 'en-US': 2, 'pt-BR': 2 }, 'en-US'), 'en-US');
  assert.equal(detectLanguage({}, 'en-US'), 'en-US');
});

test('partials grow word by word while audio streams, and finish returns the whole utterance', async (t) => {
  const deepgram = await fakeDeepgram();
  t.after(() => deepgram.close());
  const transcriber = createDeepgramTranscriber({ getKey: () => 'dg-key', url: deepgram.url });
  t.after(() => transcriber.close());
  transcriber.warm('auto');
  await until(() => transcriber.status().status === 'available');

  const partials = [];
  const stream = transcriber.start({ language: 'auto', preferred: 'en-US', onPartial: (text) => partials.push(text) });
  for (let i = 0; i < 6; i++) stream.write(frame());
  await until(() => partials.length >= 3);
  assert.deepEqual(partials.slice(0, 3), ['Como', 'Como você', 'Como você organiza']);
  const result = await stream.finish();
  assert.deepEqual(result, { text: 'Como você organiza', language: 'pt-BR' });

  const used = deepgram.connections[0];
  await until(() => used.control.includes('CloseStream'));
  assert.equal(used.auth, 'Token dg-key');
  assert.equal(used.url.searchParams.get('language'), 'multi');
  assert.deepEqual(used.control, ['Finalize', 'CloseStream']);
});

test('the utterance uses the connection opened ahead of time, and the next one is opened meanwhile', async (t) => {
  const deepgram = await fakeDeepgram();
  t.after(() => deepgram.close());
  const transcriber = createDeepgramTranscriber({ getKey: () => 'dg-key', url: deepgram.url });
  t.after(() => transcriber.close());
  transcriber.warm('pt-BR');
  await until(() => deepgram.connections.length === 1);
  const stream = transcriber.start({ language: 'pt-BR' });
  stream.write(frame());
  await until(() => deepgram.connections.length === 2);
  assert.equal(deepgram.connections[0].audio, 1600, 'the audio went to the warm connection');
  assert.equal(deepgram.connections[1].audio, 0);
  assert.equal(deepgram.connections[1].url.searchParams.get('language'), 'pt-BR');
  await stream.finish();
});

test('audio written before the connection opens is sent once it does', async (t) => {
  const deepgram = await fakeDeepgram();
  t.after(() => deepgram.close());
  const transcriber = createDeepgramTranscriber({ getKey: () => 'dg-key', url: deepgram.url });
  t.after(() => transcriber.close());
  const partials = [];
  const stream = transcriber.start({ language: 'en-US', onPartial: (text) => partials.push(text) });
  for (let i = 0; i < 4; i++) stream.write(frame());
  const result = await stream.finish();
  assert.equal(result.text, 'Como você');
  assert.equal(result.language, 'en-US', 'a fixed language is reported as is');
  assert.equal(deepgram.connections[0].audio, 6400);
});

test('a pause Deepgram detected is reported as a settled partial', async (t) => {
  const deepgram = await fakeDeepgram({
    reply(connection, { audio }) {
      if (audio && connection.audio === 1600) connection.socket.send(results('Fale sobre você.', { isFinal: true, speechFinal: true }));
    },
  });
  t.after(() => deepgram.close());
  const transcriber = createDeepgramTranscriber({ getKey: () => 'dg-key', url: deepgram.url, finalizeTimeoutMs: 50 });
  t.after(() => transcriber.close());
  const partials = [];
  const stream = transcriber.start({ language: 'pt-BR', onPartial: (text, meta) => partials.push({ text, ...meta }) });
  stream.write(frame());
  await until(() => partials.length === 1);
  assert.deepEqual(partials, [{ text: 'Fale sobre você.', settled: true }]);
  assert.equal((await stream.finish()).text, 'Fale sobre você.', 'a missing Finalize reply only waits the timeout');
});

test('a rejected key turns streaming off until the key changes', async (t) => {
  const deepgram = await fakeDeepgram({ reject: 401 });
  t.after(() => deepgram.close());
  let key = 'bad-key';
  const transcriber = createDeepgramTranscriber({ getKey: () => key, url: deepgram.url });
  t.after(() => transcriber.close());
  const errors = [];
  const stream = transcriber.start({ language: 'pt-BR', onError: (error) => errors.push(error) });
  stream.write(frame());
  const result = await stream.finish();
  assert.match(result.error, /recusou a API key/);
  assert.equal(errors.length, 1);
  assert.equal(transcriber.available(), false);
  assert.equal(transcriber.status().status, 'unavailable');
  key = 'new-key';
  transcriber.reset();
  assert.equal(transcriber.available(), true);
});

test('an unreachable service falls back for a while, then is tried again', async () => {
  let clock = 0;
  const transcriber = createDeepgramTranscriber({
    getKey: () => 'dg-key', url: 'ws://127.0.0.1:1/v1/listen', cooldownMs: 30000, now: () => clock,
  });
  const result = await transcriber.start({ language: 'pt-BR' }).finish();
  assert.ok(result.error);
  assert.equal(transcriber.available(), false);
  clock = 30000;
  assert.equal(transcriber.available(), true);
  transcriber.close();
});

test('without a key the streaming recognizer is not offered', () => {
  const transcriber = createDeepgramTranscriber({ getKey: () => null });
  assert.equal(transcriber.available(), false);
  assert.equal(transcriber.status().status, null);
});

test('an idle warm connection is kept open with KeepAlive', async (t) => {
  const deepgram = await fakeDeepgram();
  t.after(() => deepgram.close());
  const transcriber = createDeepgramTranscriber({ getKey: () => 'dg-key', url: deepgram.url, keepAliveMs: 20 });
  t.after(() => transcriber.close());
  transcriber.warm('auto');
  await until(() => deepgram.connections[0]?.control.includes('KeepAlive'));
});

test('verify reports whether Deepgram accepts the key', async () => {
  const check = (status) => createDeepgramTranscriber({ getKey: () => 'dg-key', fetchImpl: async () => ({ ok: status === 200, status }) }).verify();
  assert.equal((await check(200)).status, 'available');
  assert.equal((await check(401)).status, 'unavailable');
  assert.equal((await check(500)).status, 'unverified');
});

test('PC speech reaches the screen word by word through the streaming recognizer', async (t) => {
  const { SystemAudioEngine } = await import('./system-audio-engine.js');
  const { wirePcTranscription } = await import('./pc-transcription.js');
  const deepgram = await fakeDeepgram();
  t.after(() => deepgram.close());
  const transcriber = createDeepgramTranscriber({ getKey: () => 'dg-key', url: deepgram.url });
  t.after(() => transcriber.close());
  const engine = new SystemAudioEngine();
  const events = [];
  const finals = [];
  wirePcTranscription(engine, {
    live: transcriber,
    transcribe: async () => { throw new Error('the windowed recognizer must not run'); },
    getLanguage: () => 'auto',
    broadcast: (event) => events.push({ ...event, at: Date.now() }),
    onFinal: (text) => finals.push(text),
  });
  engine.emit('status', { isCapturing: true });
  await until(() => transcriber.status().status === 'available');

  const voice = Buffer.alloc(1600);
  for (let offset = 0; offset < voice.length; offset += 2) voice.writeInt16LE(4000, offset);
  const speechStarted = Date.now();
  for (let i = 0; i < 2; i++) engine.processPcmChunk(voice);
  await until(() => events.some((event) => event.type === 'pc_speech_partial'));
  const first = events.find((event) => event.type === 'pc_speech_partial');
  assert.equal(first.text, 'Como');
  assert.ok(first.at - speechStarted < 500, `first word after ${first.at - speechStarted} ms`);
  for (let i = 0; i < 20; i++) engine.processPcmChunk(voice);
  await until(() => events.filter((event) => event.type === 'pc_speech_partial').length >= 5);
  engine.finishSpeechSegment();
  await until(() => finals.length === 1);
  assert.deepEqual(finals, ['Como você organiza o cache?']);
  assert.equal(events.find((event) => event.type === 'pc_speech_transcribed').language, 'pt-BR');
});
