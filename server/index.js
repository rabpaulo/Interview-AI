import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgyAgent } from './agent-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Log every HTTP request
app.use((req, res, next) => {
  console.log(`[HTTP ${req.method}] ${req.url}`);
  next();
});

// Serve frontend static build if dist exists
if (fs.existsSync(distPath)) {
  console.log(`[Server] Serving static frontend from ${distPath}`);
  app.use(express.static(distPath));
}

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
  res.json({ success: true, message: 'Sessão reiniciada com sucesso' });
});

// Audio transcription endpoint (Universal fallback using python/ffmpeg)
app.post(
  '/api/transcribe',
  express.raw({
    type: ['audio/*', 'application/octet-stream', 'video/webm'],
    limit: '30mb',
  }),
  (req, res) => {
    try {
      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'Nenhum áudio recebido' });
      }

      const lang = req.query.lang || 'pt-BR';
      const tmpFile = path.join('/tmp', `perssua_rec_${Date.now()}.webm`);
      fs.writeFileSync(tmpFile, req.body);

      const scriptPath = path.resolve(__dirname, 'transcribe.py');
      const child = spawn('python3', [scriptPath, tmpFile, lang]);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        try {
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        } catch {}

        try {
          const parsed = JSON.parse(stdout.trim());
          console.log(`[Transcribe] Result:`, parsed);
          return res.json(parsed);
        } catch (e) {
          console.warn('[Transcribe Error]:', stderr || stdout);
          return res.status(500).json({
            error: 'Falha ao transcrever áudio',
            details: stderr || stdout,
          });
        }
      });
    } catch (err) {
      console.error('[Transcribe Exception]:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// REST Fallback for sending a prompt
app.post('/api/message', (req, res) => {
  const { text, source } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  if (activeAgentProcess) {
    activeAgentProcess.kill();
    activeAgentProcess = null;
  }

  let finalResponse = '';
  activeAgentProcess = runAgyAgent({
    prompt: text.trim(),
    conversationId: activeConversationId,
    cwd: process.cwd(),
    onMessage: (eventData) => {
      if (eventData.result?.response) {
        finalResponse = eventData.result.response;
      }
      if (eventData.conversation_id) {
        activeConversationId = eventData.conversation_id;
      }
    },
    onError: (err) => {
      activeAgentProcess = null;
      res.status(500).json({ error: err.message });
    },
    onClose: (code) => {
      activeAgentProcess = null;
      res.json({
        success: true,
        response: finalResponse,
        code,
        conversationId: activeConversationId,
      });
    },
  });
});

// Catch-all route to serve SPA index.html
if (fs.existsSync(distPath)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp} on path ${req.url}`);

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

  ws.on('error', (err) => {
    console.error('[WS] Client connection error:', err);
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
        if (eventData.conversation_id) {
          activeConversationId = eventData.conversation_id;
        }
        if (eventData.step_update?.conversation_id) {
          activeConversationId = eventData.step_update.conversation_id;
        }
        if (eventData.result?.conversation_id) {
          activeConversationId = eventData.result.conversation_id;
        }

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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Perssua Code Server] Running on http://localhost:${PORT}`);
  console.log(`[Perssua Code Server] WebSocket ready on ws://localhost:${PORT}`);
});
