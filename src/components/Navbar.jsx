import React from 'react';
import { Sparkles, Bot, Layers, Globe, RotateCcw, Monitor } from 'lucide-react';

export function Navbar({
  viewMode,
  setViewMode,
  isConnected,
  isProcessing,
  conversationId,
  onResetSession,
  language,
  setLanguage,
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090c]/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg tracking-tight text-white">Perssua</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Code
                </span>
              </div>
              <span className="text-[10px] text-zinc-400 font-medium -mt-1 hidden sm:block">
                Copiloto de IA por Voz
              </span>
            </div>
          </div>

          {/* Agent connection pill */}
          <div className="hidden md:flex items-center gap-2 ml-4 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? isProcessing
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400'
                  : 'bg-red-400'
              }`}
            />
            <span className="text-zinc-300 font-medium">
              {isConnected
                ? isProcessing
                  ? 'Agente Processando...'
                  : 'Antigravity Conectado'
                : 'Conectando ao Agente...'}
            </span>
            {conversationId && (
              <span className="text-zinc-400 font-mono text-[10px] border-l border-zinc-800 pl-2">
                ID: {conversationId.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Language Selector */}
          <button
            onClick={() => setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
            title="Alternar idioma de reconhecimento"
          >
            <Globe size={13} className="text-cyan-400" />
            <span className="font-semibold">{language === 'pt-BR' ? 'PT' : 'EN'}</span>
          </button>

          {/* View Mode Switcher */}
          <button
            onClick={() => setViewMode(viewMode === 'full' ? 'hud' : 'full')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
              viewMode === 'hud'
                ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
          >
            {viewMode === 'hud' ? (
              <>
                <Layers size={13} className="text-cyan-400" />
                <span>Modo HUD</span>
              </>
            ) : (
              <>
                <Monitor size={13} className="text-zinc-400" />
                <span>Dashboard</span>
              </>
            )}
          </button>

          {/* Reset Session */}
          <button
            onClick={onResetSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            title="Limpar mensagens e reiniciar sessão com o agente"
          >
            <RotateCcw size={13} />
            <span className="hidden sm:inline">Nova Sessão</span>
          </button>
        </div>
      </div>
    </header>
  );
}
