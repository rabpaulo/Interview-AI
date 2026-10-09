import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { readCandidateContext } from './candidate-context.js';

for (const provider of ['antigravity', 'codex']) {
  test(`${provider}: backend prepares on startup/settings/reset and the first question uses that thread`, { timeout: 10000 }, async (t) => {
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port),
        AGY_BIN: fileURLToPath(new URL('./fixtures/agy-session.cjs', import.meta.url)),
        CODEX_BIN: fileURLToPath(new URL('./fixtures/codex-session.cjs', import.meta.url)),
      },
    });
    let socket;
    t.after(async () => {
      socket?.terminate();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill('SIGTERM');
        await exited;
      }
    });
    child.stderr.resume();
    await new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => { if (chunk.toString().includes('WebSocket ready')) resolve(); });
      child.on('error', reject);
      child.on('exit', (code) => reject(new Error(`Backend exited: ${code}`)));
    });
    const url = `http://127.0.0.1:${port}`;
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const events = [];
    const listeners = new Set();
    socket.on('message', (raw) => {
      const event = JSON.parse(raw);
      events.push(event);
      for (const listener of listeners) listener(event);
    });
    const waitFor = (predicate, since = 0) => {
      const existing = events.slice(since).find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error(`Missing session event: ${JSON.stringify(events.slice(since))}`));
        }, 2000);
        const listener = (event) => {
          if (!predicate(event)) return;
          clearTimeout(timer);
          listeners.delete(listener);
          resolve(event);
        };
        listeners.add(listener);
      });
    };
    const ready = (event) => event.type === 'agent_session' && event.status === 'ready';
    const post = async (endpoint, body) => {
      const response = await fetch(`${url}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.ok, true);
      return response.json();
    };
    const contextFile = await fetch(`${url}/api/candidate-context/file?path=/etc/passwd`);
    const expectedFile = await readCandidateContext(fileURLToPath(new URL('../', import.meta.url)));
    assert.equal(contextFile.status, expectedFile.status);
    assert.equal(contextFile.headers.get('cache-control'), 'no-store');
    const { status: ignoredStatus, ...expectedBody } = expectedFile;
    assert.deepEqual(await contextFile.json(), expectedBody, 'only the fixed project file can be read');
    const ack = await waitFor((e) => e.type === 'connection_ack');
    const startup = ack.agentSession.status === 'ready' ? ack.agentSession : await waitFor(ready);
    assert.equal(startup.provider, 'antigravity');
    assert.equal(events.some((e) => e.type === 'agent_stream' || e.type === 'copilot_started'), false);
    const settings = { provider, model: provider === 'codex' ? 'gpt-6-luna' : 'gemini-3.8-flash', reasoningEffort: 'medium', fastMode: true };
    let prepared = startup;
    if (provider === 'codex') {
      const since = events.length;
      socket.send(JSON.stringify({ type: 'sync_settings', ...settings }));
      prepared = await waitFor((e) => ready(e) && e.provider === provider, since);
    }
    await post('/api/settings', settings);
    let status = await (await fetch(`${url}/api/status`)).json();
    assert.equal(status.agentSession.pid, prepared.pid, 'settings sent over HTTP and WS must share preparation');
    assert.equal(status.isProcessing, false, 'idle preparation must not show the agent as thinking');
    socket.send(JSON.stringify({ type: 'text_message', text: 'primeira pergunta', ...settings }));
    const completed = await waitFor((e) => e.type === 'agent_done');
    assert.equal(completed.conversationId, prepared.conversationId);
    const answer = events.find((e) => e.type === 'agent_stream' && e.data.event === 'result');
    assert.equal(answer.data.result.response, 'primeira pergunta');
    assert.equal(answer.data.result.usage.input_tokens, 10);
    for (const transport of ['ws', 'http']) {
      const since = events.length;
      if (transport === 'ws') socket.send(JSON.stringify({ type: 'reset_session' }));
      else await post('/api/reset-session', {});
      await waitFor((e) => e.type === 'session_reset', since);
      const fresh = await waitFor(ready, since);
      assert.notEqual(fresh.pid, prepared.pid);
      assert.notEqual(fresh.conversationId, prepared.conversationId);
      prepared = fresh;
    }
    // The fixture echoes the actual provider prompt, so this checks the full
    // settings -> copilot -> provider path without consuming model quota.
    for (const candidateContext of ['Tenho experiência com atendimento e treinamento.', '']) {
      await post('/api/settings', { candidateContext });
      const since = events.length;
      await post('/api/copilot/trigger', { text: 'Me conte um pouco sobre você.', persona: 'interview_hr' });
      const reply = await waitFor((event) => event.type === 'copilot_completed', since);
      assert.equal(reply.response.includes('Tenho experiência com atendimento e treinamento.'), Boolean(candidateContext));
      assert.ok(reply.response.includes('CONTEXTO PESSOAL ATUAL'));
    }
    // A reset superseded before initialization finishes must never publish an old ID.
    const since = events.length;
    socket.send(JSON.stringify({ type: 'reset_session' }));
    socket.send(JSON.stringify({ type: 'reset_session' }));
    const final = await waitFor(ready, since);
    status = await (await fetch(`${url}/api/status`)).json();
    assert.equal(status.activeConversationIds[provider], final.conversationId);
    assert.equal(events.slice(since).filter(ready).length, 1);
  });
}
