import React from 'react';
import {
  X,
  Sparkles,
  Bot,
  Zap,
  Brain,
  Check,
  ChevronRight,
  ShieldCheck,
  Cpu,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { PROVIDERS } from '../config/models.js';

export function ModelSelectorModal({
  isOpen,
  onClose,
  provider,
  setProvider,
  models,
  setModel,
  reasoningEfforts,
  setReasoningEffort,
  fastMode,
  setFastMode,
  toggleFastMode,
}) {
  if (!isOpen) return null;

  const currentProviderConfig = PROVIDERS[provider];
  const activeModelId = models[provider] || currentProviderConfig.defaultModel;
  const activeReasoning = reasoningEfforts[provider] || currentProviderConfig.defaultReasoning;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl rounded-3xl border border-zinc-800 bg-[#0e0e14] shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Cpu size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Seleção de Motor & Modelo de IA
              </h2>
              <p className="text-xs text-zinc-400">
                Alterne entre Codex e Antigravity Cloud, configure modelo, raciocínio e velocidade
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Section 1: Provider Picker */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 block flex items-center gap-1.5">
              <Layers size={13} className="text-cyan-400" />
              1. Escolha o Motor / Provedor
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option: Antigravity Cloud */}
              <button
                type="button"
                onClick={() => setProvider('antigravity')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  provider === 'antigravity'
                    ? 'border-cyan-500/60 bg-gradient-to-br from-cyan-950/30 via-zinc-900/60 to-zinc-900/40 shadow-lg shadow-cyan-500/10'
                    : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-850 hover:border-zinc-700'
                }`}
              >
                {provider === 'antigravity' && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Antigravity Cloud</h3>
                    <span className="text-[10px] text-cyan-400 font-medium">Google DeepMind</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                  Modelos Gemini (3.8, 3.7, 3.1) e parceiros de nuvem com execução de ferramentas local e ágil.
                </p>
              </button>

              {/* Option: Codex */}
              <button
                type="button"
                onClick={() => setProvider('codex')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  provider === 'codex'
                    ? 'border-purple-500/60 bg-gradient-to-br from-purple-950/30 via-zinc-900/60 to-zinc-900/40 shadow-lg shadow-purple-500/10'
                    : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-850 hover:border-zinc-700'
                }`}
              >
                {provider === 'codex' && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <Bot size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Codex</h3>
                    <span className="text-[10px] text-purple-400 font-medium">OpenAI Codex Engine</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mt-2">
                  Família GPT-6 (Luna, Sol, Astra) e GPT-5.6 com suporte nativo a Fast Mode e reasoning flexível.
                </p>
              </button>
            </div>
          </div>

          {/* Section 2: Model Picker */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Cpu size={13} className={provider === 'codex' ? 'text-purple-400' : 'text-cyan-400'} />
                2. Modelo de {currentProviderConfig.shortName}
              </label>
              <span className="text-[11px] text-zinc-400 font-mono">
                {currentProviderConfig.models.length} disponíveis
              </span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {currentProviderConfig.models.map((mod) => {
                const isSelected = mod.id === activeModelId;
                return (
                  <div
                    key={mod.id}
                    onClick={() => setModel(mod.id, provider)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                      isSelected
                        ? provider === 'codex'
                          ? 'border-purple-500/50 bg-purple-950/20 text-white'
                          : 'border-cyan-500/50 bg-cyan-950/20 text-white'
                        : 'border-zinc-800/80 bg-zinc-900/30 hover:bg-zinc-900/70 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected
                            ? provider === 'codex'
                              ? 'border-purple-400 bg-purple-500 text-white'
                              : 'border-cyan-400 bg-cyan-500 text-black'
                            : 'border-zinc-700 bg-zinc-900'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm">{mod.name}</span>
                          {mod.badge && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                mod.badgeColor === 'cyan'
                                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                  : mod.badgeColor === 'purple'
                                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                  : mod.badgeColor === 'pink'
                                  ? 'bg-pink-500/10 text-pink-400 border-pink-500/20'
                                  : mod.badgeColor === 'indigo'
                                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                  : mod.badgeColor === 'amber'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : mod.badgeColor === 'emerald'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                              }`}
                            >
                              {mod.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-1">{mod.description}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap hidden sm:inline">
                      {mod.id}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Reasoning Effort */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2.5 block flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Brain size={13} className="text-amber-400" />
                3. Nível de Reasoning (Raciocínio)
              </span>
              <span className="text-[11px] text-zinc-400 font-normal">
                Ativo:{' '}
                <strong className="text-white capitalize">
                  {currentProviderConfig.reasoningLevels.find((r) => r.id === activeReasoning)?.label || activeReasoning}
                </strong>
              </span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              {currentProviderConfig.reasoningLevels.map((lvl) => {
                const isSelected = lvl.id === activeReasoning;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setReasoningEffort(lvl.id, provider)}
                    className={`py-2.5 px-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                      isSelected
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 shadow-md shadow-amber-500/5'
                        : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {lvl.id === 'low' && (
                        <div className="flex gap-0.5 items-end h-3">
                          <span className="w-1 h-2 rounded-full bg-current" />
                          <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                          <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                        </div>
                      )}
                      {lvl.id === 'medium' && (
                        <div className="flex gap-0.5 items-end h-3">
                          <span className="w-1 h-2 rounded-full bg-current" />
                          <span className="w-1 h-3 rounded-full bg-current" />
                          <span className="w-1 h-1 rounded-full bg-current opacity-30" />
                        </div>
                      )}
                      {lvl.id === 'high' && (
                        <div className="flex gap-0.5 items-end h-3">
                          <span className="w-1 h-2 rounded-full bg-current" />
                          <span className="w-1 h-3 rounded-full bg-current" />
                          <span className="w-1 h-4 rounded-full bg-current" />
                        </div>
                      )}
                      <span className="font-bold text-xs">{lvl.label}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-normal leading-tight">
                      {lvl.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Fast Mode (Codex Only) */}
          {provider === 'codex' ? (
            <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 ${
                    fastMode
                      ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-md shadow-blue-400/10'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  <Zap size={18} className={fastMode ? 'animate-bounce' : ''} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">Fast Mode (Codex)</h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        fastMode
                          ? 'bg-blue-500/15 text-blue-200 border border-blue-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {fastMode ? 'Fast ON' : 'Fast OFF'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {fastMode
                      ? 'Usa sua assinatura ChatGPT com mais velocidade e maior consumo da cota incluída.'
                      : 'Usa sua assinatura ChatGPT na velocidade padrão, com menor consumo da cota.'}
                  </p>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                type="button"
                onClick={toggleFastMode}
                className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  fastMode ? 'bg-blue-500' : 'bg-zinc-700'
                }`}
                title="Alternar entre Fast ON e Fast OFF"
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-zinc-950 shadow-lg ring-0 transition duration-200 ease-in-out ${
                    fastMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/30 flex items-center gap-2.5 text-xs text-zinc-400">
              <Sparkles size={14} className="text-cyan-400 shrink-0" />
              <span>
                Antigravity Cloud utiliza inferência em nuvem de alta taxa de transferência nativa pelo DeepMind.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              Configurado:{' '}
              <strong className="text-white">
                {currentProviderConfig.shortName} • {currentProviderConfig.models.find((m) => m.id === activeModelId)?.name || activeModelId}
              </strong>{' '}
              ({activeReasoning.toUpperCase()})
              {provider === 'codex' && (
                <span className="text-amber-400 font-semibold ml-1">
                  • {fastMode ? 'Fast ON' : 'Fast OFF'}
                </span>
              )}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition cursor-pointer"
          >
            Pronto / Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
