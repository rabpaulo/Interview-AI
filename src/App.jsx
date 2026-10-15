import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, X, RefreshCw } from 'lucide-react';
import { CompactTabs } from './components/CompactTabs.jsx';
import { CompactTranscriptFeed } from './components/CompactTranscriptFeed.jsx';
import { CompactAudioMeters } from './components/CompactAudioMeters.jsx';
import { CompactBottomBar } from './components/CompactBottomBar.jsx';
import { CompactModeBar } from './components/CompactModeBar.jsx';
import { ModelSelectorModal } from './components/ModelSelectorModal.jsx';
import { PersonaSelectorModal } from './components/PersonaSelectorModal.jsx';
import { CandidateContextEditor } from './components/CandidateContextEditor.jsx';
import { NotesVaultModal } from './components/NotesVaultModal.jsx';
import { useVoiceCopilot } from './hooks/useVoiceCopilot.js';
import { useAgentSocket } from './hooks/useAgentSocket.js';
import { useAgentSettings } from './hooks/useAgentSettings.js';
import { useCandidateProfile } from './hooks/useCandidateProfile.js';
import { useNotesVault } from './hooks/useNotesVault.js';
import { useTextZoom } from './hooks/useTextZoom.js';
import { AUTO_LANGUAGE } from '../shared/language.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('transcription'); // transcription | session | summary
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('interviewai_language_v1') || AUTO_LANGUAGE;
    } catch {
      return AUTO_LANGUAGE;
    }
  });
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionToast, setSessionToast] = useState(null);
  const [isCompact, setIsCompact] = useState(() => {
    try {
      return localStorage.getItem('interviewai_compact_v1') === '1';
    } catch {
      return false;
    }
  });
  const toggleCompact = useCallback(() => setIsCompact((value) => !value), []);

  // Agent Settings (Provider: Antigravity / Codex, Model, Reasoning Effort, Fast Mode)
  const agentSettings = useAgentSettings();
  // Candidate profile, persisted by the backend in a file outside the app's own data.
  const candidateProfile = useCandidateProfile();
  const notesVault = useNotesVault();
  // Ctrl +/-/0 scale the reading feed while the window has focus.
  useTextZoom();

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
    syncLanguage,
    pcDetectedLanguage,

    pcAudioLevel,
    isPcCapturing,
    isPcSpeaking,
    isTranscribingPc,
    pcAudioError,
    pcLiveTranscripts,
    utteranceNotes,
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
    });
  }, [
    syncSettings,
    agentSettings.provider,
    agentSettings.currentModelId,
    agentSettings.currentReasoning,
    agentSettings.fastMode,
  ]);

  useEffect(() => {
    syncLanguage(language);
    try {
      localStorage.setItem('interviewai_language_v1', language);
    } catch {}
  }, [syncLanguage, language]);

  useEffect(() => {
    try {
      localStorage.setItem('interviewai_compact_v1', isCompact ? '1' : '0');
    } catch {}
    window.interviewaiDesktop?.setMode?.(isCompact ? 'compact' : 'normal');
  }, [isCompact]);

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
    detectedLanguage: micDetectedLanguage,
  } = useVoiceCopilot({
    language,
    onFinalTranscript: handleFinalTranscript,
  });

  // Whichever side spoke last decides the language shown in the menu.
  useEffect(() => { if (micDetectedLanguage) setDetectedLanguage(micDetectedLanguage); }, [micDetectedLanguage]);
  useEffect(() => { if (pcDetectedLanguage) setDetectedLanguage(pcDetectedLanguage); }, [pcDetectedLanguage]);

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

  // Desktop keyboard shortcuts (Alt+Space toggles mic, Ctrl+D triggers copilot, Alt+N / Ctrl+Shift+R for new session)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt+Space -> Toggle microphone
      if (e.altKey && e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        toggleListening();
      }

      // Ctrl+D / Cmd+D -> Trigger Copilot
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        triggerCopilot(null, {
          provider: agentSettings.provider,
          model: agentSettings.currentModelId,
          persona: selectedPersona,
          reasoningEffort: agentSettings.currentReasoning,
          fastMode: agentSettings.fastMode,
        });
      }

      // Alt+C -> Modo compacto
      if (e.altKey && e.code === 'KeyC' && !e.repeat) {
        e.preventDefault();
        toggleCompact();
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
    toggleListening,
    toggleCompact,
    agentSettings.provider,
    agentSettings.currentModelId,
    agentSettings.currentReasoning,
    agentSettings.fastMode,
    selectedPersona,
  ]);

  // Electron Desktop shortcuts & IPC synchronization
  useEffect(() => {
    if (window.interviewaiDesktop?.onShortcut) {
      const cleanup = window.interviewaiDesktop.onShortcut((action) => {
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

  // Ctrl+Alt+S: the main process captures the screen and the image goes straight to the agent.
  useEffect(() => {
    if (!window.interviewaiDesktop?.onScreenshot) return undefined;
    return window.interviewaiDesktop.onScreenshot(({ image, error }) => {
      if (error || !image) {
        setSessionToast(`Falha na captura de tela: ${error || 'imagem vazia'}`);
        setTimeout(() => setSessionToast(null), 4000);
        return;
      }
      sendMessage('', 'screenshot', {
        provider: agentSettings.provider,
        model: agentSettings.currentModelId,
        reasoningEffort: agentSettings.currentReasoning,
        fastMode: agentSettings.fastMode,
        images: [image],
      });
    });
  }, [
    sendMessage,
    agentSettings.provider,
    agentSettings.currentModelId,
    agentSettings.currentReasoning,
    agentSettings.fastMode,
  ]);

  const togglePcCapture = () => {
    if (isPcCapturing) stopPcCapture();
    else startPcCapture();
  };
  const isWindowDraggable = !isModelModalOpen && !isPersonaModalOpen && !isContextOpen && !isNotesOpen;
  const menuProps = {
    language,
    setLanguage,
    detectedLanguage,
    selectedPersona,
    onOpenModelModal: () => setIsModelModalOpen(true),
    onOpenPersonaModal: () => setIsPersonaModalOpen(true),
    onOpenNotesModal: () => setIsNotesOpen(true),
    notesStatus: notesVault.status,
    onNewSession: handleNewSession,
    isCompact,
    onToggleCompact: toggleCompact,
  };

  return (
    <div className="app-shell text-zinc-100 flex flex-col h-dvh w-screen overflow-hidden select-none">
      {/* Frameless Desktop Window Container */}
      <div className="app-frame flex flex-col h-full w-full">

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

        {/* InterviewAI Tabs (Transcrição • Sessão • Resumo); also the window drag handle,
            released while a modal is open because drag regions swallow clicks under overlays. */}
        {!isCompact && (
          <CompactTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            countMessages={messages.length}
            isListening={isListening}
            isTranscribing={isTranscribing}
            isProcessing={isProcessing}
            elapsedSeconds={elapsedSeconds}
            isDraggable={isWindowDraggable}
          />
        )}

        {/* Core Feed ("Mostra só o que deve mostrar") */}
        <CompactTranscriptFeed
          activeTab={isCompact ? 'transcription' : activeTab}
          isCompact={isCompact}
          messages={messages}
          interimTranscript={interimTranscript}
          isListening={isListening}
          isPcCapturing={isPcCapturing}
          isPcSpeaking={isPcSpeaking}
          isTranscribingPc={isTranscribingPc}
          pcLiveTranscripts={pcLiveTranscripts}
          utteranceNotes={utteranceNotes}
          autoRespond={autoRespond}
          isProcessing={isProcessing}
          currentToolCall={currentToolCall}
          frequencyBars={frequencyBars}
          onAbort={abortAgent}
          onTriggerCopilot={triggerCopilot}
          onSendMessage={sendMessage}
          agentSettings={agentSettings}
        />

        {isCompact ? (
          <CompactModeBar
            menuProps={menuProps}
            agentSettings={agentSettings}
            meterProps={{ audioLevel, isListening, pcAudioLevel, isPcCapturing, isPcSpeaking, onTogglePcCapture: togglePcCapture }}
            onExitCompact={toggleCompact}
            isDraggable={isWindowDraggable}
          />
        ) : (
          <>
            {/* Slim Audio Meters (Você • PC Call • Agente) */}
            <CompactAudioMeters
              audioLevel={audioLevel}
              isListening={isListening}
              isProcessing={isProcessing}
              pcAudioLevel={pcAudioLevel}
              isPcCapturing={isPcCapturing}
              isPcSpeaking={isPcSpeaking}
              onTogglePcCapture={togglePcCapture}
              agentSettings={agentSettings}
            />

            {/* Compact Bottom Controls Bar (Context • Keyboard Drawer • Mic) */}
            <CompactBottomBar
              isListening={isListening}
              isProcessing={isProcessing}
              toggleListening={toggleListening}
              onSendMessage={sendMessage}
              agentSettings={agentSettings}
              onOpenContext={() => setIsContextOpen(true)}
              hasContext={!candidateProfile.isEmpty}
              menuProps={menuProps}
            />
          </>
        )}
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

      {isContextOpen && (
        <CandidateContextEditor
          profile={candidateProfile.profile}
          file={candidateProfile.file}
          status={candidateProfile.status}
          loadError={candidateProfile.error}
          onRetry={candidateProfile.reload}
          onSave={candidateProfile.save}
          onClose={() => setIsContextOpen(false)}
        />
      )}

      <NotesVaultModal isOpen={isNotesOpen} onClose={() => setIsNotesOpen(false)} vault={notesVault} />

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
