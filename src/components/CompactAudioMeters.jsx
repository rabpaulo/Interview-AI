import React, { useState } from 'react';
import { Mic, Monitor, Bot, Sparkles, ChevronDown, ChevronUp, Volume2 } from 'lucide-react';

export function CompactAudioMeters({
  audioLevel,
  isListening,
  isProcessing,
  pcAudioLevel = 0,
  isPcCapturing = false,
  isPcSpeaking = false,
  onTogglePcCapture,
  agentSettings,
}) {
  const [isCollapsed, setIsCollapsed] = useState(true); // default collapsed to stay minimal, or easily toggled!

  const providerName = agentSettings?.currentProviderConfig?.shortName || 'Agente';
  const agentLevel = isProcessing ? Math.max(30, Math.min(95, Math.floor(Math.random() * 40) + 50)) : 0;

  return (
    <div className="app-audio-panel px-4 py-2 select-none">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <Volume2 size={12} className={isListening || isPcSpeaking ? 'text-blue-300' : 'text-zinc-500'} />
          <span className="font-medium tracking-wide text-[10px] text-zinc-300">
            Medidores de Áudio
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            (PC: {isPcCapturing ? 'ON' : 'OFF'} • Mic: {isListening ? 'ON' : 'OFF'})
          </span>
        </div>

          <div className="app-quiet-button flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300">
          <span>{isCollapsed ? 'Expandir' : 'Ocultar'}</span>
          {isCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </div>
      </button>

      {!isCollapsed && (
        <div className="mt-2 space-y-2 pt-2 border-t border-white/[0.06]">
          {/* Row 1: VOCÊ (Microfone) */}
          <div className="flex items-center gap-2 text-[10px]">
            <div className="w-14 flex items-center gap-1 font-medium text-zinc-400">
              <Mic size={11} className={isListening ? 'text-blue-300' : 'text-zinc-600'} />
              <span>VOCÊ</span>
            </div>
            <div className="audio-level-track flex-1 h-1.5 rounded-full overflow-hidden">
              <div
                className="audio-level-fill h-full rounded-full transition-all duration-75"
                style={{ width: `${isListening ? Math.max(4, audioLevel) : 0}%` }}
              />
            </div>
            <span className="w-7 text-right font-mono text-zinc-400 text-[9px]">
              {isListening ? `${audioLevel}%` : '0%'}
            </span>
          </div>

          {/* Row 2: PC / REUNIÃO (Loopback) */}
          <div className="flex items-center gap-2 text-[10px]">
            <div className="w-14 flex items-center gap-1 font-medium text-zinc-400">
              <Monitor size={11} className={isPcSpeaking ? 'text-blue-300 animate-pulse' : 'text-zinc-600'} />
              <span>PC CALL</span>
            </div>
            <div className="audio-level-track flex-1 h-1.5 rounded-full overflow-hidden">
              <div
                className="audio-level-fill h-full rounded-full transition-all duration-75"
                style={{ width: `${isPcCapturing ? Math.max(isPcSpeaking ? 16 : 4, pcAudioLevel) : 0}%` }}
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-7 text-right font-mono text-zinc-400 text-[9px]">
                {isPcCapturing ? `${pcAudioLevel}%` : 'OFF'}
              </span>
              <button
                type="button"
                onClick={onTogglePcCapture}
                className={`px-1.5 py-0.2 rounded text-[9px] font-bold transition cursor-pointer border ${
                  isPcCapturing
                  ? 'audio-toggle-active bg-blue-500/10 border-blue-500/25 text-blue-200'
                    : 'bg-white/[0.04] border-white/[0.08] text-zinc-400'
                }`}
                title="Ligar ou desligar captura de áudio do sistema"
              >
                {isPcCapturing ? 'Ativo' : 'Ligar'}
              </button>
            </div>
          </div>

          {/* Row 3: AGENTE */}
          <div className="flex items-center gap-2 text-[10px]">
            <div className="w-14 flex items-center gap-1 font-medium text-zinc-400">
              <Bot size={11} className={isProcessing ? 'text-blue-300 animate-pulse' : 'text-zinc-600'} />
              <span>AGENTE</span>
            </div>
            <div className="audio-level-track flex-1 h-1.5 rounded-full overflow-hidden">
              <div
                className="audio-level-fill h-full rounded-full transition-all duration-150"
                style={{ width: `${isProcessing ? agentLevel : 0}%` }}
              />
            </div>
            <span className="w-7 text-right font-mono text-zinc-400 text-[9px]">
              {isProcessing ? `${agentLevel}%` : '0%'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
