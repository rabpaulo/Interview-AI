import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTranscriber } from './transcriber.js';

// A stand-in for `transcribe.py --serve`, written in Node so the test needs no Python.
function fakeWorker(dir, body) {
  const script = path.join(dir, 'worker.cjs');
  fs.writeFileSync(script, `
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(path.join(__dirname, 'starts'), 'x');
let buffer = '';
process.stdin.on('data', (data) => {
  buffer += data;
  let end;
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const request = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    fs.appendFileSync(path.join(__dirname, 'files'), request.file + '\\n');
    (${body})(request, (result) => process.stdout.write(JSON.stringify({ id: request.id, ...result }) + '\\n'));
  }
});`);
  return createTranscriber({ python: () => ({ command: process.execPath, args: [] }), script });
}

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interviewai-transcriber-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const read = (dir, name) => (fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), 'utf8') : '');

test('one worker answers every request, concurrently and by id', async (t) => {
  const dir = scratch(t);
  const transcriber = fakeWorker(dir, `(request, reply) => setTimeout(() => reply({ text: request.language + ':' + require('node:fs').readFileSync(request.file, 'utf8'), language: 'pt-BR' }), request.language === 'slow' ? 80 : 5)`);
  t.after(() => transcriber.close());
  const [slow, fast] = await Promise.all([
    transcriber.transcribe(Buffer.from('a'), 'slow'),
    transcriber.transcribe(Buffer.from('b'), 'pt-BR'),
  ]);
  assert.deepEqual(slow, { text: 'slow:a', language: 'pt-BR' });
  assert.deepEqual(fast, { text: 'pt-BR:b', language: 'pt-BR' });
  assert.equal(read(dir, 'starts'), 'x', 'Python starts once, not once per chunk');
  for (const file of read(dir, 'files').trim().split('\n')) assert.equal(fs.existsSync(file), false);
});

test('a stalled worker returns an error, is replaced, and its temporary audio is removed', async (t) => {
  const dir = scratch(t);
  const transcriber = fakeWorker(dir, `(request, reply) => { if (request.language === 'ok') reply({ text: 'ok' }); }`);
  t.after(() => transcriber.close());
  const result = await transcriber.transcribe(Buffer.alloc(44), 'pt-BR', { timeoutMs: 300 });
  assert.match(result.error || '', /tempo|demorou/i);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const [stalledFile] = read(dir, 'files').trim().split('\n');
  assert.equal(fs.existsSync(stalledFile), false);
  assert.deepEqual(await transcriber.transcribe(Buffer.alloc(44), 'ok'), { text: 'ok' });
  assert.equal(read(dir, 'starts'), 'xx');
});

test('a cancelled request settles at once', async (t) => {
  const dir = scratch(t);
  const transcriber = fakeWorker(dir, `(request, reply) => setTimeout(() => reply({ text: 'late' }), 200)`);
  t.after(() => transcriber.close());
  const controller = new AbortController();
  const pending = transcriber.transcribe(Buffer.alloc(44), 'pt-BR', { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, { error: 'Transcrição cancelada' });
});

test('a missing Python is reported as an error', async () => {
  const transcriber = createTranscriber({ python: () => ({ command: '/nonexistent/python3', args: [] }) });
  const result = await transcriber.transcribe(Buffer.alloc(44), 'pt-BR', { timeoutMs: 2000 });
  assert.ok(result.error);
});
