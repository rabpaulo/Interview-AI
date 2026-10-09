import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as bridge from './agent-bridge.js';

function fixture(t) {
  const previous = process.env.AGY_BIN;
  const previousCodex = process.env.CODEX_BIN;
  process.env.AGY_BIN = fileURLToPath(new URL('./fixtures/agy-session.cjs', import.meta.url));
  process.env.CODEX_BIN = fileURLToPath(new URL('./fixtures/codex-session.cjs', import.meta.url));
  t.after(() => {
    bridge.closeAgentSession();
    if (previous === undefined) delete process.env.AGY_BIN;
    else process.env.AGY_BIN = previous;
    if (previousCodex === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previousCodex;
  });
}

function turn(options) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const handle = bridge.runAgyAgent({
      ...options, onMessage: (message) => messages.push(message),
      onError: reject, onClose: (code) => {
        if (code !== 0) return reject(new Error(`Exit: ${code}`));
        const result = messages.find((m) => m.event === 'result')?.result;
        if (!result) return reject(new Error(`Missing result: ${JSON.stringify(messages)}`));
        resolve({ handle, messages, result });
      },
    });
  });
}

test('consecutive responses reuse the initialized process and complete each turn separately', { timeout: 3000 }, async (t) => {
  fixture(t);
  const first = await turn({ prompt: 'primeira resposta' });
  const second = await turn({ prompt: 'segunda resposta', conversationId: first.result.conversation_id });
  assert.equal(second.handle.pid, first.handle.pid, 'continuing the conversation must skip process startup');
  assert.equal(first.result.response, 'primeira resposta');
  assert.equal(second.result.response, 'segunda resposta');
  assert.deepEqual(second.result.usage, { input_tokens: 10, output_tokens: 2 });
  assert.ok(second.result.duration_seconds < 1, 'duration must exclude earlier turns and idle time');
});

test('new conversations and changed model settings cannot reuse unrelated context', { timeout: 3000 }, async (t) => {
  fixture(t);
  const first = await turn({ prompt: 'primeira' });
  const changed = await turn({ prompt: 'segunda', conversationId: first.result.conversation_id, reasoningEffort: 'medium' });
  assert.notEqual(changed.handle.pid, first.handle.pid);
  const fresh = await turn({ prompt: 'nova', reasoningEffort: 'medium' });
  assert.notEqual(fresh.handle.pid, changed.handle.pid);
  assert.notEqual(fresh.result.conversation_id, changed.result.conversation_id);
});

test('cancelling a turn suppresses late results and releases the process', { timeout: 3000 }, async (t) => {
  fixture(t);
  const events = [];
  const cancelled = bridge.runAgyAgent({
    prompt: 'antiga', onMessage: (message) => events.push(message),
    onClose: () => events.push('closed'), onError: () => events.push('error'),
  });
  cancelled.kill();
  const next = await turn({ prompt: 'atual' });
  assert.notEqual(next.handle.pid, cancelled.pid);
  assert.equal(next.result.response, 'atual');
  assert.deepEqual(events, []);
});

test('a completed handle cannot cancel a later turn on the warm process', { timeout: 3000 }, async (t) => {
  fixture(t);
  const first = await turn({ prompt: 'primeira' });
  const next = turn({ prompt: 'segunda', conversationId: first.result.conversation_id });
  first.handle.kill();
  assert.equal((await next).result.response, 'segunda');
});

test('spawn failures produce one error and no successful completion', { timeout: 3000 }, async (t) => {
  fixture(t);
  process.env.AGY_BIN = '/tmp/nonexistent-perssua-test-binary';
  let errors = 0;
  let completions = 0;
  await new Promise((resolve) => bridge.runAgyAgent({
    prompt: 'teste', onError: () => { errors++; resolve(); }, onClose: () => completions++,
  }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors, 1);
  assert.equal(completions, 0);
});

for (const prompt of ['__error__', '__exit__']) {
  test(`${prompt}: failed turns never emit successful completion and the next request recovers`, { timeout: 3000 }, async (t) => {
    fixture(t);
    let completions = 0;
    await new Promise((resolve) => bridge.runAgyAgent({
      prompt, onError: resolve, onClose: () => completions++,
    }));
    assert.equal(completions, 0);
    assert.equal((await turn({ prompt: 'recuperada' })).result.response, 'recuperada');
  });
}

test('cancelled Codex runs cannot deliver stale callbacks to the next live response', { timeout: 3000 }, async (t) => {
  fixture(t);
  const stale = [];
  const cancelled = bridge.runCodexAgent({ prompt: 'antiga',
    onMessage: (message) => stale.push(message), onClose: () => stale.push('close'), onError: () => stale.push('error'),
  });
  cancelled.kill();
  const messages = [];
  await new Promise((resolve, reject) => bridge.runCodexAgent({ prompt: 'atual',
    onMessage: (message) => messages.push(message), onClose: resolve, onError: reject,
  }));
  assert.deepEqual(stale, []);
  assert.equal(messages.find((message) => message.event === 'result').result.response, 'atual');
});

for (const provider of ['antigravity', 'codex']) {
  const run = (options) => new Promise((resolve, reject) => {
    const messages = [];
    const handle = bridge.runUnifiedAgent({ provider, ...options,
      onMessage: (event) => messages.push(event), onError: reject,
      onClose: () => resolve({ handle, messages, result: messages.find((e) => e.event === 'result').result }),
    });
  });
  test(`${provider}: preparing starts an idle session and the first question reuses its process and thread`, { timeout: 3000 }, async (t) => {
    fixture(t);
    t.after(() => bridge.closeAgentSession());
    const prepared = await bridge.prepareAgentSession({ provider });
    assert.ok(prepared.conversationId);
    assert.ok(prepared.pid);
    const duplicate = await bridge.prepareAgentSession({ provider });
    assert.deepEqual(duplicate, prepared, 'duplicate settings must not create another thread');
    const first = await run({ prompt: 'primeira pergunta', conversationId: prepared.conversationId });
    assert.equal(first.handle.pid, prepared.pid);
    assert.equal(first.result.conversation_id, prepared.conversationId);
    assert.equal(first.result.response, 'primeira pergunta');
    assert.equal(first.result.usage.input_tokens, 10, 'preparation must not generate a model turn');
    const second = await run({ prompt: 'segunda', conversationId: first.result.conversation_id });
    first.handle.kill();
    assert.equal(second.handle.pid, first.handle.pid);
    assert.equal(second.result.response, 'segunda');
    assert.equal(second.result.usage.input_tokens, 10);
    bridge.closeAgentSession(provider);
    const fresh = await bridge.prepareAgentSession({ provider });
    assert.notEqual(fresh.pid, prepared.pid);
    assert.notEqual(fresh.conversationId, prepared.conversationId);
  });
  test(`${provider}: a question arriving during preparation uses the same initializing process`, { timeout: 3000 }, async (t) => {
    fixture(t);
    t.after(() => bridge.closeAgentSession());
    const pending = bridge.prepareAgentSession({ provider });
    const answer = await run({ prompt: 'pergunta imediata' });
    assert.equal(answer.handle.pid, (await pending).pid);
    assert.equal(answer.result.response, 'pergunta imediata');
  });
  test(`${provider}: reset during preparation suppresses the old session and prepares a fresh one`, { timeout: 3000 }, async (t) => {
    fixture(t);
    t.after(() => bridge.closeAgentSession());
    const pending = bridge.prepareAgentSession({ provider });
    const rejection = assert.rejects(pending, /encerrada/);
    bridge.closeAgentSession(provider);
    await rejection;
    const fresh = await bridge.prepareAgentSession({ provider });
    const answer = await run({ prompt: 'nova', conversationId: fresh.conversationId });
    assert.equal(answer.handle.pid, fresh.pid);
  });
}
for (const prompt of ['__error__', '__exit__', '__rpc_error__']) {
  test(`Codex ${prompt}: failed turns emit one error, never complete and allow recovery`, { timeout: 3000 }, async (t) => {
    fixture(t);
    t.after(() => bridge.closeAgentSession());
    let errors = 0;
    let completions = 0;
    await new Promise((resolve) => bridge.runCodexAgent({ prompt,
      onError: () => { errors++; resolve(); }, onClose: () => completions++,
    }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(errors, 1);
    assert.equal(completions, 0);
    await new Promise((resolve, reject) => bridge.runCodexAgent({ prompt: 'recuperada', onClose: resolve, onError: reject }));
  });
}
