import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Globe,
  Pin,
  Minus,
  X,
  ChevronDown,
  RotateCcw,
  Zap,
} from 'lucide-react';

import { getPersonaById } from '../config/personas.js';

export function CompactHeader({
  isConnected,
  isProcessing,
  isListening,
  isTranscribing,
  elapsedSeconds,
  language,
  setLanguage,
  agentSettings,
  selectedPersona,
  onOpenModelModal,
  onOpenPersonaModal,
  onNewSession,
  onResetSession,
}) {
  const [isPinned, setIsPinned] = useState(true);

  useEffect(() => {
    if (window.perssuaDesktop?.getAlwaysOnTop) {
      window.perssuaDesktop.getAlwaysOnTop().then((pinned) => {
        setIsPinned(!!pinned);
      });
    }
  }, []);

  const handleTogglePin = async () => {
    if (window.perssuaDesktop?.toggleAlwaysOnTop) {
      const pinned = await window.perssuaDesktop.toggleAlwaysOnTop();
      setIsPinned(!!pinned);
    } else {
      setIsPinned(!isPinned);
    }
  };

  const handleMinimize = () => {
    if (window.perssuaDesktop?.minimize) {
      window.perssuaDesktop.minimize();
    }
  };

  const handleClose = () => {
    if (window.perssuaDesktop?.close) {
      window.perssuaDesktop.close();
    }
  };

  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const { provider, currentProviderConfig, currentModel, fastMode } = agentSettings;
  const currentPersona = getPersonaById(selectedPersona);

  return (
    <header className="app-header app-drag-region sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-2.5 select-none">
      {/* Left: Branding & Model Button */}
      <div className="flex items-center gap-2 app-no-drag">
        {/* Perssua dot logo */}
        <div className="app-brand-mark w-6 h-6 rounded-md flex items-center justify-center" aria-hidden="true">
          <span className="flex items-end gap-[2px] h-3.5">
            <span className="w-[2px] h-2 rounded-full" />
            <span className="w-[2px] h-3.5 rounded-full" />
            <span className="w-[2px] h-2.5 rounded-full" />
            <span className="w-[2px] h-1.5 rounded-full" />
          </span>
        </div>

        {/* Perssua Text */}
        <span className="font-semibold text-[13px] tracking-tight text-white hidden min-[340px]:inline">Perssua</span>

        {/* Model Pill Trigger */}
        <button
          type="button"
          onClick={onOpenModelModal}
          className="app-header-chip flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-zinc-300 transition cursor-pointer max-w-[125px]"
          title="Clique para alternar o modelo de IA e configurações"
        >
          {provider === 'codex' ? (
            <Bot size={11} className="text-blue-300 shrink-0" />
          ) : (
            <Sparkles size={11} className="text-blue-300 shrink-0" />
          )}
          <span className="truncate font-medium">{currentModel?.name || currentProviderConfig.shortName}</span>
          {fastMode && provider === 'codex' && <Zap size={9} className="text-amber-400 shrink-0" />}
          <ChevronDown size={10} className="text-zinc-500 shrink-0" />
        </button>

        {/* Persona / Interview Mode Pill Trigger */}
        <button
          type="button"
          onClick={onOpenPersonaModal}
          className="app-header-chip flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-zinc-300 transition cursor-pointer max-w-[145px]"
          title="Clique para alternar o Tipo de Entrevista ou Modo (Perssua & Cody)"
        >
          <span className="truncate font-medium">{currentPersona?.shortName || 'Reunião Geral'}</span>
          <ChevronDown size={10} className="text-zinc-500 shrink-0" />
        </button>
      </div>

      {/* Center: Live Timer & Status Pill */}
      <div className="app-live-status flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-mono">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isListening
              ? 'bg-blue-400 animate-ping'
              : isTranscribing
              ? 'bg-blue-400 animate-pulse'
              : isProcessing
              ? 'bg-blue-400 animate-pulse'
              : 'bg-zinc-500'
          }`}
        />
        <span className="text-zinc-100 tabular-nums font-medium">
          {formatTimer(elapsedSeconds)}
        </span>
        <span className="text-[10px] text-zinc-400 font-sans hidden min-[420px]:inline">
          {isListening
            ? 'Ouvindo'
            : isTranscribing
            ? 'Transcrevendo'
            : isProcessing
            ? 'Gerando'
            : 'Pronto'}
        </span>
      </div>

      {/* Right: Window & Session Actions */}
      <div className="flex items-center gap-1 app-no-drag">
        {/* Language switch */}
        <button
          type="button"
          onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}
          className="app-quiet-button px-1.5 py-1 rounded text-[10px] font-semibold text-zinc-400 transition cursor-pointer"
          title="Alternar idioma (PT / EN)"
        >
          {language === 'pt-BR' ? 'PT' : 'EN'}
        </button>

        {/* Nova Sessão Button */}
        <button
          type="button"
          onClick={() => (onNewSession ? onNewSession() : onResetSession?.(provider))}
          className="app-header-chip flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium text-zinc-300 transition cursor-pointer"
          title="Nova Sessão: limpa todo o chat e reinicia a conversa do zero (Atalho: Alt+N ou Ctrl+Shift+R)"
        >
          <RotateCcw size={11} className="text-zinc-400 shrink-0" />
          <span className="hidden min-[380px]:inline">Nova Sessão</span>
        </button>

        {/* Pin (Always-on-top) */}
        <button
          type="button"
          onClick={handleTogglePin}
          className={`p-1 rounded transition cursor-pointer ${
            isPinned
            ? 'app-pin-active text-blue-300'
              : 'app-quiet-button text-zinc-400'
          }`}
          title={isPinned ? 'Fixado no topo (ativo)' : 'Fixar no topo'}
        >
          <Pin size={12} className={isPinned ? 'rotate-45' : ''} />
        </button>

        {/* Desktop Window Controls */}
        <button
          type="button"
          onClick={handleMinimize}
          className="app-window-button p-1 rounded text-zinc-400 transition cursor-pointer"
          title="Minimizar"
        >
          <Minus size={12} />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="app-window-button app-window-close p-1 rounded text-zinc-400 transition cursor-pointer"
          title="Fechar"
        >
          <X size={12} />
        </button>
      </div>
    </header>
  );
}
