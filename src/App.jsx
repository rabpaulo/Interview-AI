import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, X, RefreshCw } from 'lucide-react';
import { CompactHeader } from './components/CompactHeader.jsx';
import { CompactTabs } from './components/CompactTabs.jsx';
import { CompactTranscriptFeed } from './components/CompactTranscriptFeed.jsx';
import { CompactAudioMeters } from './components/CompactAudioMeters.jsx';
import { CompactBottomBar } from './components/CompactBottomBar.jsx';
import { ModelSelectorModal } from './components/ModelSelectorModal.jsx';
import { PersonaSelectorModal } from './components/PersonaSelectorModal.jsx';
import { useVoiceCopilot } from './hooks/useVoiceCopilot.js';
import { useAgentSocket } from './hooks/useAgentSocket.js';
import { useAgentSettings } from './hooks/useAgentSettings.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('transcription'); // transcription | session | summary
  const [language, setLanguage] = useState('pt-BR');
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionToast, setSessionToast] = useState(null);

  // Agent Settings (Provider: Antigravity / Codex, Model, Reasoning Effort, Fast Mode)
  const agentSettings = useAgentSettings();

  // Agent WebSocket connection hook with PC Loopback & Copilot
  const {
    isConnected,
    isProcessing,
    conversationIds,
    messages,
    currentToolCall,
    sendMessage,
    abortAgent,
    resetSession,
    syncSettings,

    pcAudioLevel,
    isPcCapturing,
    isPcSpeaking,
    isTranscribingPc,
    pcAudioError,
    pcLiveTranscripts,
    clearPcAudioError,
    autoRespond,
    selectedPersona,
    changePersona,
    startPcCapture,
    stopPcCapture,
    triggerCopilot,
  } = useAgentSocket();

  // Sincroniza configurações do modelo com o servidor em tempo real
  useEffect(() => {
    syncSettings({
      provider: agentSettings.provider,
      model: agentSettings.currentModelId,
      reasoningEffort: agentSettings.currentReasoning,
      fastMode: agentSettings.fastMode,
      candidateContext: agentSettings.candidateContext,
    });
  }, [
    syncSettings,
    agentSettings.provider,
    agentSettings.currentModelId,
    agentSettings.currentReasoning,
    agentSettings.fastMode,
    agentSettings.candidateContext,
  ]);

  // Callback when a final voice message is recognized
  const handleFinalTranscript = useCallback(
    (transcript) => {
      console.log('[App] Voice recognized:', transcript);
      sendMessage(transcript, 'voice', {
        provider: agentSettings.provider,
        model: agentSettings.currentModelId,
        reasoningEffort: agentSettings.currentReasoning,
        fastMode: agentSettings.fastMode,
      });
    },
    [
      sendMessage,
      agentSettings.provider,
      agentSettings.currentModelId,
      agentSettings.currentReasoning,
      agentSettings.fastMode,
    ]
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
    toggleListening,
    startRecording,
    cancelRecording,
  } = useVoiceCopilot({
    language,
    onFinalTranscript: handleFinalTranscript,
  });

  // Nova Sessão: limpa todo o chat, reseta cronômetro, aborta processos e reinicia do zero
  const handleNewSession = useCallback(() => {
    cancelRecording();
    abortAgent();
    resetSession();
    setElapsedSeconds(0);
    setActiveTab('transcription');
    setSessionToast('Nova sessão iniciada. Chat resetado.');
    setTimeout(() => setSessionToast(null), 3000);
  }, [abortAgent, resetSession, cancelRecording]);

  // Timer counter when active or listening
  useEffect(() => {
    let timer;
    if (isListening || isPcSpeaking || isProcessing) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isListening, isPcSpeaking, isProcessing]);

  // Auto-connect PC loopback audio capture on launch
  useEffect(() => {
    startPcCapture();
  }, [startPcCapture]);

  // Desktop keyboard shortcuts (Alt+Space / Ctrl+D to trigger copilot, Alt+N / Ctrl+Shift+R for new session)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt+Space or Ctrl+D / Cmd+D -> Trigger Copilot
      if ((e.altKey && e.code === 'Space') || ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D'))) {
        e.preventDefault();
        triggerCopilot(null, {
          provider: agentSettings.provider,
          model: agentSettings.currentModelId,
          persona: selectedPersona,
          reasoningEffort: agentSettings.currentReasoning,
          fastMode: agentSettings.fastMode,
        });
      }

      // Alt+N or Ctrl+Shift+R -> Nova Sessão
      if ((e.altKey && (e.key === 'n' || e.key === 'N')) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        handleNewSession();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    triggerCopilot,
    handleNewSession,
    agentSettings.provider,
    agentSettings.currentModelId,
    agentSettings.currentReasoning,
    agentSettings.fastMode,
    selectedPersona,
  ]);

  // Electron Desktop shortcuts & IPC synchronization
  useEffect(() => {
    if (window.perssuaDesktop?.onShortcut) {
      const cleanup = window.perssuaDesktop.onShortcut((action) => {
        console.log('[Desktop IPC] Shortcut received:', action);
        if (action === 'ask_copilot') {
          triggerCopilot(null, {
            provider: agentSettings.provider,
            model: agentSettings.currentModelId,
            persona: selectedPersona,
            reasoningEffort: agentSettings.currentReasoning,
            fastMode: agentSettings.fastMode,
          });
        } else if (action === 'new_session') {
          handleNewSession();
        } else if (action === 'toggle_pc_audio') {
          if (isPcCapturing) stopPcCapture();
          else startPcCapture();
        } else if (action === 'toggle_mic') {
          toggleListening();
        }
      });
      return cleanup;
    }
  }, [
    triggerCopilot,
    handleNewSession,
    isPcCapturing,
    startPcCapture,
    stopPcCapture,
    toggleListening,
    agentSettings.provider,
    agentSettings.currentModelId,
    agentSettings.currentReasoning,
    agentSettings.fastMode,
    selectedPersona,
  ]);

  return (
    <div className="app-shell text-zinc-100 flex flex-col h-dvh w-screen overflow-hidden select-none">
      {/* Frameless Desktop Window Container */}
      <div className="app-frame flex flex-col h-full w-full">

        {/* Sleek Notch / Header Bar */}
        <CompactHeader
          isConnected={isConnected}
          isProcessing={isProcessing}
          isListening={isListening}
          isTranscribing={isTranscribing}
          elapsedSeconds={elapsedSeconds}
          language={language}
          setLanguage={setLanguage}
          agentSettings={agentSettings}
          selectedPersona={selectedPersona}
          onOpenModelModal={() => setIsModelModalOpen(true)}
          onOpenPersonaModal={() => setIsPersonaModalOpen(true)}
          onNewSession={handleNewSession}
          onResetSession={handleNewSession}
        />

        {/* New Session Feedback Banner */}
        {sessionToast && (
          <div className="bg-blue-500/10 border-b border-blue-500/25 px-3 py-1.5 flex items-center justify-between text-[11px] text-blue-200 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span>{sessionToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setSessionToast(null)}
              className="p-0.5 hover:bg-blue-500/20 rounded transition text-blue-200 hover:text-white cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Mic Permission / Error Banner */}
        {pcAudioError && (
          <div role="alert" className="bg-rose-500/10 border-b border-rose-500/20 px-3 py-2 flex items-start justify-between gap-2 text-[11px] text-rose-300">
            <div className="flex items-start gap-1.5">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>Áudio do PC: {pcAudioError}. A fala não foi enviada ao modelo. Tente novamente.</span>
            </div>
            <button type="button" onClick={clearPcAudioError} aria-label="Fechar erro do áudio do PC" className="p-0.5 shrink-0 hover:bg-rose-500/20 rounded cursor-pointer">
              <X size={12} />
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-3 py-1.5 flex items-center justify-between text-[11px] text-rose-300">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={13} className="text-rose-400 shrink-0" />
              <span className="truncate max-w-[260px]">{errorMessage}</span>
              {micPermission === 'denied' && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="underline font-semibold hover:text-white cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw size={10} /> Tentar
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={clearError}
              className="p-0.5 hover:bg-rose-500/20 rounded transition text-rose-300 hover:text-white cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Perssua Tabs (Transcrição • Sessão • Resumo) */}
        <CompactTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          countMessages={messages.length}
        />

        {/* Core Feed ("Mostra só o que deve mostrar") */}
        <CompactTranscriptFeed
          activeTab={activeTab}
          messages={messages}
          interimTranscript={interimTranscript}
          isListening={isListening}
          isPcCapturing={isPcCapturing}
          isPcSpeaking={isPcSpeaking}
          isTranscribingPc={isTranscribingPc}
          pcLiveTranscripts={pcLiveTranscripts}
          autoRespond={autoRespond}
          isProcessing={isProcessing}
          currentToolCall={currentToolCall}
          frequencyBars={frequencyBars}
          onAbort={abortAgent}
          onTriggerCopilot={triggerCopilot}
          onSendMessage={sendMessage}
          agentSettings={agentSettings}
        />

        {/* Slim Audio Meters (Você • PC Call • Agente) */}
        <CompactAudioMeters
          audioLevel={audioLevel}
          isListening={isListening}
          isProcessing={isProcessing}
          pcAudioLevel={pcAudioLevel}
          isPcCapturing={isPcCapturing}
          isPcSpeaking={isPcSpeaking}
          onTogglePcCapture={() => {
            if (isPcCapturing) stopPcCapture();
            else startPcCapture();
          }}
          agentSettings={agentSettings}
        />

        {/* Compact Bottom Controls Bar (Mic • Diga isso • Keyboard Drawer) */}
        <CompactBottomBar
          isListening={isListening}
          isProcessing={isProcessing}
          toggleListening={toggleListening}
          onSendMessage={sendMessage}
          onTriggerCopilot={triggerCopilot}
          agentSettings={agentSettings}
        />
      </div>

      {/* Model & AI Settings Modal */}
      <ModelSelectorModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        provider={agentSettings.provider}
        setProvider={agentSettings.setProvider}
        models={agentSettings.models}
        setModel={agentSettings.setModel}
        reasoningEfforts={agentSettings.reasoningEfforts}
        setReasoningEffort={agentSettings.setReasoningEffort}
        fastMode={agentSettings.fastMode}
        setFastMode={agentSettings.setFastMode}
        toggleFastMode={agentSettings.toggleFastMode}
      />

      {/* Persona / Interview Type Modal */}
      <PersonaSelectorModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        selectedPersona={selectedPersona}
        onSelectPersona={changePersona}
      />
    </div>
  );
}
