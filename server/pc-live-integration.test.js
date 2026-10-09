import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

test('backend transcribes live but responds only after the complete PC utterance', { timeout: 10000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perssua-pc-live-'));
  const executable = (name, code) => {
    fs.writeFileSync(path.join(dir, name), '#!/usr/bin/env node\n' + code);
    fs.chmodSync(path.join(dir, name), 0o755);
  };
  executable('pactl', "console.log(process.argv.includes('get-default-sink') ? 'test_sink' : '0\\ttest_sink\\ttest');");
  executable('python3', "console.log(JSON.stringify({text: 'Como resolvo esse problema no servidor?'}));");
  executable('parec', "const pcm=Buffer.alloc(1600); for(let i=0;i<pcm.length;i+=2) pcm.writeInt16LE(4000,i); let frames=0; setInterval(()=>process.stdout.write(++frames<=60 ? pcm : Buffer.alloc(1600)),50);");
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const cli = fileURLToPath(new URL('./fixtures/agy-session.cjs', import.meta.url));
  const child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
    cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), PATH: `${dir}:${process.env.PATH}`, AGY_BIN: cli, CODEX_BIN: cli },
  });
  let socket;
  t.after(async () => {
    socket?.terminate();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => { if (chunk.toString().includes('WebSocket ready')) resolve(); });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`Backend exited: ${code}`)));
  });
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const events = [];
  const response = await new Promise((resolve, reject) => {
    socket.on('error', reject);
    socket.on('message', (raw) => {
      const event = JSON.parse(raw);
      events.push(event);
      if (event.type === 'connection_ack') {
        socket.send(JSON.stringify({ type: 'sync_settings', candidateContext: 'Experiência real de suporte ao cliente.' }));
        socket.send(JSON.stringify({ type: 'start_pc_capture', options: { sink: 'test_sink' } }));
      }
      if (event.type === 'copilot_error' || event.type === 'pc_speech_error') reject(new Error(event.error));
      if (event.type === 'copilot_completed') resolve(event);
    });
  });
  assert.equal(events.some((event) => event.type === 'pc_speech_start'), true);
  assert.equal(events.some((event) => event.type === 'pc_speech_partial'), true);
  assert.equal(events.some((event) => event.type === 'pc_speech_end'), true);
  const started = events.findIndex((event) => event.type === 'copilot_started');
  const transcribed = events.findIndex((event) => event.type === 'pc_speech_transcribed');
  assert.ok(transcribed >= 0 && started > transcribed, 'the complete transcript must precede inference');
  assert.equal(events.filter((event) => event.type === 'copilot_started').length, 1);
  assert.equal(response.isPreview, false);
  assert.match(response.replyId, /^copilot-pc-/);
  assert.ok(response.response);
  assert.ok(response.response.includes('Experiência real de suporte ao cliente.'), 'automatic responses must receive candidate context');
});
