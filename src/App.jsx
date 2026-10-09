import React, { useState, useCallback } from 'react';
import { AlertCircle, X, RefreshCw } from 'lucide-react';
import { Navbar } from './components/Navbar.jsx';
import { HeroWaveform } from './components/HeroWaveform.jsx';
import { AudioMeters } from './components/AudioMeters.jsx';
import { TranscriptFeed } from './components/TranscriptFeed.jsx';
import { AudioControls } from './components/AudioControls.jsx';
import { FloatingHud } from './components/FloatingHud.jsx';
import { useVoiceCopilot } from './hooks/useVoiceCopilot.js';
import { useAgentSocket } from './hooks/useAgentSocket.js';

export default function App() {
  const [viewMode, setViewMode] = useState('full'); // 'full' | 'hud'
  const [language, setLanguage] = useState('pt-BR');

  // Agent WebSocket connection hook
  const {
    isConnected,
    isProcessing,
    conversationId,
    messages,
    currentToolCall,
    sendMessage,
    abortAgent,
    clearMessages,
  } = useAgentSocket();

  // Callback when a final voice message is recognized
  const handleFinalTranscript = useCallback(
    (transcript) => {
      console.log('[App] Voice recognized:', transcript);
      sendMessage(transcript, 'voice');
    },
    [sendMessage]
  );

  // Unified Voice Copilot hook (Microphone, Web Audio, MediaRecorder & Web Speech)
  const {
    isListening,
    isTranscribing,
    interimTranscript,
    audioLevel,
    frequencyBars,
    micPermission,
    errorMessage,
    clearError,
    isPushToTalkActive,
    toggleListening,
    startRecording,
  } = useVoiceCopilot({
    language,
    onFinalTranscript: handleFinalTranscript,
  });

  const lastMessage = messages[messages.length - 1];

  return (
    <div className="min-h-screen bg-[#09090c] text-zinc-100 flex flex-col selection:bg-cyan-500/20">
      {/* Top Navigation */}
      <Navbar
        viewMode={viewMode}
        setViewMode={setViewMode}
        isConnected={isConnected}
        isProcessing={isProcessing}
        conversationId={conversationId}
        onResetSession={clearMessages}
        language={language}
        setLanguage={setLanguage}
      />

      {/* Mic Error or Permission Banner */}
      {errorMessage && (
        <div className="bg-rose-500/10 border-b border-rose-500/25 px-4 py-2.5 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <AlertCircle size={15} className="text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
            {micPermission === 'denied' && (
              <button
                onClick={startRecording}
                className="ml-2 underline font-semibold hover:text-white cursor-pointer flex items-center gap-1"
              >
                <RefreshCw size={12} /> Tentar novamente
              </button>
            )}
          </div>
          <button
            onClick={clearError}
            className="p-1 hover:bg-rose-500/20 rounded transition text-rose-300 hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Content Dashboard */}
      {viewMode === 'full' ? (
        <main className="flex-1 flex flex-col">
          {/* Perssua Hero Waveform Section */}
          <HeroWaveform
            isListening={isListening}
            isProcessing={isProcessing}
            isTranscribing={isTranscribing}
            toggleListening={toggleListening}
            frequencyBars={frequencyBars}
            isPushToTalkActive={isPushToTalkActive}
          />

          {/* Perssua Dual Meters (VOCÊ / AGENTE) */}
          <AudioMeters
            audioLevel={audioLevel}
            isProcessing={isProcessing}
            isListening={isListening}
          />

          {/* Controls & Quick Prompts */}
          <AudioControls
            onSendMessage={sendMessage}
            isProcessing={isProcessing}
            isListening={isListening}
          />

          {/* Feed of Transcripts and Agent Code Output */}
          <TranscriptFeed
            messages={messages}
            interimTranscript={interimTranscript}
            isListening={isListening}
            isProcessing={isProcessing}
            currentToolCall={currentToolCall}
            onAbort={abortAgent}
          />
        </main>
      ) : (
        /* Focused HUD View */
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-lg p-8 rounded-3xl bg-zinc-950/80 border border-zinc-800 shadow-2xl backdrop-blur-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Modo HUD Flutuante Ativado</h2>
            <p className="text-sm text-zinc-400 mb-6">
              O copiloto de voz está ativo no widget flutuante no canto inferior da tela. Você pode
              manter sua IDE em tela cheia e falar seus comandos livremente.
            </p>
            <button
              onClick={() => setViewMode('full')}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 text-black font-semibold text-xs hover:bg-cyan-400 transition cursor-pointer"
            >
              Voltar ao Dashboard Completo
            </button>
          </div>
        </main>
      )}

      {/* Floating HUD Widget (available in both modes or overlay) */}
      <FloatingHud
        isListening={isListening}
        isProcessing={isProcessing}
        toggleListening={toggleListening}
        frequencyBars={frequencyBars}
        interimTranscript={interimTranscript}
        lastMessage={lastMessage}
        onExpand={() => setViewMode('full')}
      />

      {/* Minimal Footer */}
      <footer className="border-t border-zinc-900/80 py-4 px-6 text-center text-xs text-zinc-400">
        Perssua Code Copilot • Integrado com Google Antigravity & DeepMind Gemini
      </footer>
    </div>
  );
}
