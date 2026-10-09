import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

console.log('[Test Client] Connecting to ws://localhost:3001...');

ws.on('open', () => {
  console.log('[Test Client] Connected! Sending test voice prompt...');
  ws.send(
    JSON.stringify({
      type: 'voice_message',
      text: 'Responda apenas: Olá do Antigravity!',
      source: 'voice',
    })
  );
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'agent_stream') {
    if (msg.data?.step_update?.text_delta) {
      process.stdout.write(msg.data.step_update.text_delta);
    }
    if (msg.data?.result) {
      console.log('\n[RESULT RECEIVED]:', msg.data.result.response);
    }
  }
  if (msg.type === 'agent_done') {
    console.log('[Test Client] Turn complete! Exit code:', msg.code);
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('[Test Client] Error:', err);
  process.exit(1);
});
