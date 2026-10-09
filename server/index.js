import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import fs from 'fs';
import { runAgyAgent } from './agent-bridge.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let activeConversationId = null;
let activeAgentProcess = null;

// REST endpoints
app.get('/api/status', (req, res) => {
  const agyBin = process.env.AGY_BIN || '/home/paulo/.local/bin/agy';
  const hasAgy = fs.existsSync(agyBin);

  res.json({
    status: 'online',
    agyAvailable: hasAgy,
    agyBinPath: agyBin,
    cwd: process.cwd(),
    activeConversationId,
    isProcessing: activeAgentProcess !== null,
  });
});

app.post('/api/reset-session', (req, res) => {
  if (activeAgentProcess) {
    activeAgentProcess.kill();
    activeAgentProcess = null;
  }
  activeConversationId = null;
  res.json({ success: true, message: 'Session reset' });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Send current status on connect
  ws.send(
    JSON.stringify({
      type: 'connection_ack',
      conversationId: activeConversationId,
      isProcessing: activeAgentProcess !== null,
    })
  );

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleClientMessage(ws, data);
    } catch (err) {
      console.error('[WS] Invalid JSON message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

function handleClientMessage(ws, data) {
  const { type } = data;

  if (type === 'voice_message' || type === 'text_message') {
    const prompt = data.text?.trim();
    if (!prompt) {
      ws.send(JSON.stringify({ type: 'error', error: 'Mensagem vazia' }));
      return;
    }

    if (activeAgentProcess) {
      console.log('[WS] Aborting previous running process for new prompt...');
      activeAgentProcess.kill();
      activeAgentProcess = null;
    }

    // Broadcast user message to UI
    ws.send(
      JSON.stringify({
        type: 'user_message_acknowledged',
        text: prompt,
        timestamp: Date.now(),
        source: data.source || 'voice',
      })
    );

    // Notify agent is starting
    ws.send(
      JSON.stringify({
        type: 'agent_status',
        status: 'thinking',
        prompt,
      })
    );

    activeAgentProcess = runAgyAgent({
      prompt,
      conversationId: activeConversationId,
      cwd: process.cwd(),
      onMessage: (eventData) => {
        // Track conversation_id if emitted
        if (eventData.conversation_id) {
          activeConversationId = eventData.conversation_id;
        }
        if (eventData.step_update?.conversation_id) {
          activeConversationId = eventData.step_update.conversation_id;
        }
        if (eventData.result?.conversation_id) {
          activeConversationId = eventData.result.conversation_id;
        }

        // Send streaming event to frontend
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_stream',
              data: eventData,
            })
          );
        }
      },
      onError: (err) => {
        console.error('[Bridge Error]:', err);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_error',
              error: err.message,
            })
          );
        }
        activeAgentProcess = null;
      },
      onClose: (code) => {
        activeAgentProcess = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'agent_done',
              code,
              conversationId: activeConversationId,
            })
          );
        }
      },
    });
  } else if (type === 'abort') {
    if (activeAgentProcess) {
      activeAgentProcess.kill();
      activeAgentProcess = null;
      ws.send(JSON.stringify({ type: 'agent_aborted' }));
    }
  } else if (type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  }
}

server.listen(PORT, () => {
  console.log(`[Perssua Code Server] Running on http://localhost:${PORT}`);
  console.log(`[Perssua Code Server] WebSocket ready on ws://localhost:${PORT}`);
});
