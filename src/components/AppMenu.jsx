import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Sparkles,
  Bot,
  Asterisk,
  Briefcase,
  Languages,
  RotateCcw,
  Droplet,
  Pin,
  Minus,
  X,
  ChevronRight,
  Zap,
  Type,
} from 'lucide-react';

import { getPersonaById } from '../config/personas.js';
import { useWindowOpacity, MIN_OPACITY, MAX_OPACITY } from '../hooks/useWindowOpacity.js';

export function AppMenu({
  language,
  setLanguage,
  agentSettings,
  selectedPersona,
  onOpenModelModal,
  onOpenPersonaModal,
  onNewSession,
  onOpenChange,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(true);
  const { opacity, setOpacity, solidText, setSolidText, canSolidText, isSupported: isDesktop } = useWindowOpacity();
  const menuRef = useRef(null);

  const setOpen = (open) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    window.perssuaDesktop?.getAlwaysOnTop?.().then((pinned) => setIsPinned(!!pinned));
  }, []);

  const handleTogglePin = async () => {
    if (window.perssuaDesktop?.toggleAlwaysOnTop) {
      setIsPinned(!!(await window.perssuaDesktop.toggleAlwaysOnTop()));
    } else {
      setIsPinned(!isPinned);
    }
  };

  const runAndClose = (action) => () => {
    setOpen(false);
    action?.();
  };

  const { provider, currentProviderConfig, currentModel, fastMode } = agentSettings;
  const currentPersona = getPersonaById(selectedPersona);
  const ProviderIcon = provider === 'codex' ? Bot : provider === 'claude' ? Asterisk : Sparkles;
  const needsCompositor = window.perssuaDesktop?.usesCssOpacity;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-label="Menu"
        aria-expanded={isOpen}
        title="Menu"
        className={`p-2 rounded-xl transition cursor-pointer ${isOpen ? 'bg-white/10 text-white' : 'app-quiet-button text-zinc-400'}`}
      >
        <Menu size={15} />
      </button>

      {isOpen && (
        <div role="menu" className="app-menu absolute left-0 bottom-full mb-2 z-40 w-64 rounded-xl p-1.5 text-[12px]">
          <button type="button" role="menuitem" onClick={runAndClose(onOpenModelModal)} className="app-menu-item">
            <ProviderIcon size={14} className="text-blue-300 shrink-0" />
            <span className="text-zinc-400">Modelo</span>
            <span className="ml-auto flex items-center gap-1 truncate text-zinc-100 font-medium">
              <span className="truncate">{currentModel?.name || currentProviderConfig.shortName}</span>
              {fastMode && provider === 'codex' && <Zap size={10} className="text-amber-400 shrink-0" />}
            </span>
            <ChevronRight size={12} className="text-zinc-500 shrink-0" />
          </button>

          <button type="button" role="menuitem" onClick={runAndClose(onOpenPersonaModal)} className="app-menu-item">
            <Briefcase size={14} className="text-zinc-400 shrink-0" />
            <span className="text-zinc-400">Modo</span>
            <span className="ml-auto truncate text-zinc-100 font-medium">{currentPersona?.shortName || 'Reunião Geral'}</span>
            <ChevronRight size={12} className="text-zinc-500 shrink-0" />
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}
            className="app-menu-item"
          >
            <Languages size={14} className="text-zinc-400 shrink-0" />
            <span className="text-zinc-400">Idioma</span>
            <span className="ml-auto text-zinc-100 font-semibold">{language === 'pt-BR' ? 'PT' : 'EN'}</span>
          </button>

          <button type="button" role="menuitem" onClick={runAndClose(onNewSession)} className="app-menu-item">
            <RotateCcw size={14} className="text-zinc-400 shrink-0" />
            <span className="text-zinc-100">Nova sessão</span>
            <span className="ml-auto text-[10px] text-zinc-500">Alt+N</span>
          </button>

          {isDesktop && (
            <>
              <div className="app-menu-divider" />

              <div className="px-2.5 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <Droplet size={14} className="text-zinc-400 shrink-0" />
                  <span className="text-zinc-400">Opacidade</span>
                  <span className="ml-auto text-zinc-100 tabular-nums">{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={MIN_OPACITY * 100}
                  max={MAX_OPACITY * 100}
                  step={5}
                  value={Math.round(opacity * 100)}
                  onChange={(event) => setOpacity(Number(event.target.value) / 100)}
                  className="app-opacity-slider w-full cursor-pointer"
                  aria-label="Opacidade da janela"
                />
                {needsCompositor && opacity < MAX_OPACITY && (
                  <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
                    No Linux/X11 a transparência exige um compositor (picom ou xcompmgr) ativo antes de abrir o app.
                  </p>
                )}
              </div>

              {canSolidText && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={solidText}
                  onClick={() => setSolidText(!solidText)}
                  className="app-menu-item"
                  title="Deixa só o fundo transparente e mantém o texto 100% opaco e com alto contraste"
                >
                  <Type size={14} className={`shrink-0 ${solidText ? 'text-blue-300' : 'text-zinc-400'}`} />
                  <span className="text-zinc-100">Texto nítido</span>
                  <span className={`app-menu-switch ml-auto ${solidText ? 'app-menu-switch--on' : ''}`} aria-hidden="true" />
                </button>
              )}

              <button type="button" role="menuitemcheckbox" aria-checked={isPinned} onClick={handleTogglePin} className="app-menu-item">
                <Pin size={14} className={`shrink-0 ${isPinned ? 'rotate-45 text-blue-300' : 'text-zinc-400'}`} />
                <span className="text-zinc-100">Fixar no topo</span>
                <span className={`app-menu-switch ml-auto ${isPinned ? 'app-menu-switch--on' : ''}`} aria-hidden="true" />
              </button>

              <div className="app-menu-divider" />

              <div className="flex gap-1">
                <button type="button" role="menuitem" onClick={runAndClose(() => window.perssuaDesktop?.minimize?.())} className="app-menu-item flex-1">
                  <Minus size={14} className="text-zinc-400 shrink-0" />
                  <span className="text-zinc-100">Minimizar</span>
                </button>
                <button type="button" role="menuitem" onClick={() => window.perssuaDesktop?.close?.()} className="app-menu-item app-menu-item--danger flex-1">
                  <X size={14} className="shrink-0" />
                  <span>Fechar</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
