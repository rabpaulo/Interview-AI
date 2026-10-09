import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribeAudioBuffer } from './transcriber.js';

test('a stalled transcriber returns an error and removes temporary audio', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perssua-transcriber-test-'));
  const originalPath = process.env.PATH;
  // Record the temporary filename, then simulate a recognition request that hangs.
  fs.writeFileSync(path.join(dir, 'python3'), '#!/usr/bin/env node\n' +
    "require('node:fs').writeFileSync(require('node:path').join(__dirname, 'input-path'), process.argv[3]);\n" +
    'setInterval(() => {}, 1000);\n');
  fs.chmodSync(path.join(dir, 'python3'), 0o755);
  process.env.PATH = `${dir}:${originalPath || ''}`;
  try {
    const result = await transcribeAudioBuffer(Buffer.alloc(44), 'pt-BR', { timeoutMs: 300 });
    assert.match(result.error || '', /tempo|demorou/i);
    const input = fs.readFileSync(path.join(dir, 'input-path'), 'utf8');
    assert.equal(fs.existsSync(input), false);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
