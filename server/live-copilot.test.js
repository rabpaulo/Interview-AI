import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveCopilot } from './live-copilot.js';
import { SystemAudioEngine } from './system-audio-engine.js';
import { wirePcTranscription } from './pc-transcription.js';

function harness(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const jobs = [];
  const finalized = [];
  const discarded = [];
  const live = createLiveCopilot({ ...options,
    onFinalized: (id) => finalized.push(id),
    onDiscarded: (id) => discarded.push(id),
    start: (request) => {
      const job = { ...request, cancelled: false };
      jobs.push(job);
      return { kill: () => { job.cancelled = true; } };
    },
  });
  t.after(() => live.cancel());
  return { live, jobs, finalized, discarded };
}

test('incomplete PC speech never starts an answer and the complete question starts immediately', async (t) => {
  const { live, jobs } = harness(t);
  const engine = new SystemAudioEngine();
  let calls = 0;
  const transcription = wirePcTranscription(engine, {
    transcribe: async () => ({ text: ++calls === 1
      ? 'Como resolvo esse problema'
      : 'esse problema no servidor sem perder os dados?' }),
    getLanguage: () => 'pt-BR', broadcast() {},
    onPartial: live.partial, onFinal: live.final, onCancel: live.cancel,
  });
  t.after(() => { engine.stopCapture(); transcription.cancel(); });
  const pcm = Buffer.alloc(1600);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(4000, i);
  for (let frame = 0; frame < 60; frame++) engine.processPcmChunk(pcm);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(4000);
  assert.equal(engine.inSpeech, true);
  assert.equal(jobs.length, 0, 'a partial question must not occupy the model');
  engine.finishSpeechSegment();
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(0);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].text, 'Como resolvo esse problema no servidor sem perder os dados?');
  assert.equal(jobs[0].isPreview(), false);
});

test('partials stay pending regardless of length or time and the final starts once', (t) => {
  const { live, jobs, finalized } = harness(t);
  live.partial('Como resolver isso?', 'a');
  t.mock.timers.tick(10000);
  live.partial('Como resolver isso sem perder os dados de produção?', 'a');
  t.mock.timers.tick(10000);
  assert.equal(jobs.length, 0);
  live.final('Como resolver isso sem perder os dados de produção?', 'a');
  t.mock.timers.tick(0);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].isPreview(), false);
  jobs[0].onSettled();
  t.mock.timers.tick(10000);
  assert.equal(jobs.length, 1);
  assert.deepEqual(finalized, ['a']);
});

test('an unfinished cancelled turn never consumes a model request', (t) => {
  const { live, jobs, discarded } = harness(t);
  live.partial('Como resolver isso sem perder os dados?', 'a');
  live.cancel('a');
  t.mock.timers.tick(10000);
  assert.equal(jobs.length, 0);
  assert.deepEqual(discarded, ['a']);
});

test('manual mode never invokes the model and short complete utterances are accepted', (t) => {
  let enabled = false;
  const { live, jobs } = harness(t, { enabled: () => enabled });
  live.partial('Como resolver isso?', 'a');
  live.final('Como resolver isso?', 'a');
  t.mock.timers.tick(5000);
  assert.equal(jobs.length, 0);
  enabled = true;
  live.partial('Oi', 'b');
  t.mock.timers.tick(5000);
  assert.equal(jobs.length, 0);
  live.final('Oi', 'b');
  t.mock.timers.tick(0);
  assert.equal(jobs.length, 1);
});

test('a busy provider waits with complete text and never starts on partials', (t) => {
  let ready = false;
  const { live, jobs } = harness(t, { canStart: () => ready });
  live.partial('Como resolver isso?', 'a');
  live.final('Como resolver isso sem perder os dados?', 'a');
  t.mock.timers.tick(1000);
  assert.equal(jobs.length, 0);
  ready = true;
  t.mock.timers.tick(500);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].text, 'Como resolver isso sem perder os dados?');
});

test('cancelled inference cannot affect a new utterance', (t) => {
  const { live, jobs } = harness(t);
  live.final('Como resolvo esse problema no servidor?', 'a');
  t.mock.timers.tick(0);
  live.cancel();
  assert.equal(jobs[0].cancelled, true);
  live.final('Qual seria uma resposta para outra pergunta?', 'b');
  t.mock.timers.tick(0);
  jobs[0].onSettled();
  t.mock.timers.tick(5000);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].utteranceId, 'b');
});

test('when inference falls behind the latest complete question runs next', (t) => {
  const { live, jobs, discarded } = harness(t);
  live.final('Como resolvo esse problema no servidor?', 'a');
  t.mock.timers.tick(0);
  live.final('Outra pergunta sobre a segurança do sistema?', 'b');
  live.partial('Qual é o próximo passo', 'c');
  live.final('Qual é o próximo passo que devemos seguir agora?', 'c');
  assert.equal(jobs[0].cancelled, false);
  jobs[0].onSettled();
  t.mock.timers.tick(0);
  assert.equal(jobs[1].utteranceId, 'c');
  assert.deepEqual(discarded, ['b']);
  jobs[1].onSettled();
  live.final('Outra pergunta sobre a segurança do sistema?', 'b');
  t.mock.timers.tick(5000);
  assert.equal(jobs.length, 2);
});

test('a burst of new utterances never restarts the active warm model', (t) => {
  const { live, jobs } = harness(t);
  live.final('Como resolvo esse problema no servidor?', 'a');
  t.mock.timers.tick(0);
  for (let i = 1; i <= 6; i++) live.final(`Qual o próximo passo da pergunta número ${i}?`, `b${i}`);
  assert.equal(jobs[0].cancelled, false);
  jobs[0].onSettled();
  t.mock.timers.tick(0);
  assert.equal(jobs[1].utteranceId, 'b6');
});
