import React, { useState, useEffect } from 'react';
import { Mic, MicOff, AudioLines, Sparkles, Terminal, Keyboard } from 'lucide-react';

const ROTATING_TEXTS = [
  'suas instruções de código',
  'seus comandos de terminal',
  'suas correções de bugs',
  'suas ideias de arquitetura',
  'seus pedidos de refatoração',
];

export function HeroWaveform({
  isListening,
  isProcessing,
  isTranscribing,
  toggleListening,
  frequencyBars,
  isPushToTalkActive,
}) {
  const [rotatingIndex, setRotatingIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Rotate hero phrases
  useEffect(() => {
    const interval = setInterval(() => {
      setRotatingIndex((prev) => (prev + 1) % ROTATING_TEXTS.length);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  // Timer when listening or processing
  useEffect(() => {
    let timer;
    if (isListening || isProcessing) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isListening, isProcessing]);

  const formatTimer = (totalSec) => {
    const mins = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <section className="relative pt-8 pb-12 px-4 sm:px-6 overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-cyan-600/10 via-purple-600/15 to-transparent blur-[110px] pointer-events-none -z-10 rounded-full" />

      <div className="max-w-4xl mx-auto text-center">
        {/* Title & Rotating badge */}
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight sm:leading-tight">
          Perssua{' '}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-2xl sm:text-4xl align-middle">
            <AudioLines className="w-5 h-5 sm:w-8 sm:h-8 animate-pulse text-cyan-400" />
            escuta
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent transition-all duration-500">
            {ROTATING_TEXTS[rotatingIndex]}
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-zinc-400 text-sm sm:text-base mb-8">
          Fale naturalmente com seu agente de código em tempo real. O Perssua captura cada
          comando de voz, transcreve instantaneamente e despacha para o{' '}
          <strong className="text-zinc-200 font-semibold">Antigravity</strong>, exibindo soluções,
          código e execuções na tela.
        </p>

        {/* Perssua Waveform Box */}
        <div className="relative rounded-2xl p-6 sm:p-8 bg-zinc-950/70 border border-zinc-800/90 shadow-2xl backdrop-blur-2xl max-w-2xl mx-auto overflow-hidden">
          {/* Header Bar with Clock & Status */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800/80">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
              <span className="font-mono text-xs sm:text-sm font-semibold text-zinc-200">
                {formatTimer(elapsedSeconds)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isListening
                    ? 'bg-emerald-400 animate-ping'
                    : isTranscribing
                    ? 'bg-amber-400 animate-pulse'
                    : isProcessing
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-zinc-600'
                }`}
              />
              <span className="text-xs sm:text-sm font-medium text-zinc-300">
                {isListening
                  ? isPushToTalkActive
                    ? 'Escutando (Push-To-Talk)...'
                    : 'Escutando sua voz...'
                  : isTranscribing
                  ? 'Processando áudio com IA...'
                  : isProcessing
                  ? 'Agente Antigravity executando...'
                  : 'Aguardando comando de voz'}
              </span>
            </div>
          </div>

          {/* Waveform Bars */}
          <div className="h-28 sm:h-32 flex items-end justify-center gap-1 sm:gap-1.5 px-2 py-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">
            {frequencyBars.map((height, idx) => {
              // Color gradient across the bars
              const isCenter = idx >= 18 && idx <= 30;
              return (
                <div
                  key={idx}
                  className={`w-1 sm:w-1.5 rounded-full transition-all duration-75 ${
                    isListening
                      ? isCenter
                        ? 'bg-gradient-to-t from-cyan-500 to-indigo-400 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
                        : 'bg-gradient-to-t from-cyan-600/70 to-cyan-400/80'
                      : isProcessing
                      ? 'bg-gradient-to-t from-purple-600 to-indigo-400 animate-pulse'
                      : 'bg-zinc-700/60'
                  }`}
                  style={{
                    height: `${height}%`,
                    opacity: isListening ? Math.min(1, 0.4 + height / 100) : 0.35,
                  }}
                />
              );
            })}
          </div>

          {/* Central Mic Interactive Trigger */}
          <div className="mt-6 flex flex-col items-center gap-3">
            <button
              onClick={toggleListening}
              className={`relative group flex items-center justify-center w-16 h-16 sm:w-18 sm:h-18 rounded-full transition-all duration-300 cursor-pointer shadow-xl ${
                isListening
                  ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-red-500/30 scale-105'
                  : 'bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 text-white hover:shadow-cyan-500/25 hover:scale-105'
              }`}
            >
              {isListening && (
                <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-25" />
              )}
              {isListening ? (
                <MicOff className="w-7 h-7 sm:w-8 sm:h-8" />
              ) : (
                <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
              )}
            </button>

            {/* Instruction / Keyboard Shortcut hint */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Keyboard size={13} className="text-zinc-400" />
              <span>
                Clique para gravar ou segure{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-[11px]">
                  ESPAÇO
                </kbd>{' '}
                (Push-to-Talk)
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
