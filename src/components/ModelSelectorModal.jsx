import React from 'react';
import { X, Sparkles, Bot, Asterisk, Zap, Check, RefreshCw } from 'lucide-react';
import { PROVIDERS } from '../config/models.js';
import { unavailableReason } from '../../shared/provider-availability.js';

const ACCENTS = {
  antigravity: { selected: 'border-cyan-500/50 bg-cyan-950/20 text-white', radio: 'border-cyan-400 bg-cyan-500 text-black' },
  codex: { selected: 'border-purple-500/50 bg-purple-950/20 text-white', radio: 'border-purple-400 bg-purple-500 text-white' },
  claude: { selected: 'border-amber-500/50 bg-amber-950/20 text-white', radio: 'border-amber-400 bg-amber-500 text-black' },
};

const PROVIDER_OPTIONS = [
  {
    id: 'antigravity',
    Icon: Sparkles,
    active: 'border-cyan-500/60 bg-gradient-to-br from-cyan-950/30 via-zinc-900/60 to-zinc-900/40 shadow-lg shadow-cyan-500/10',
    iconClass: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
  },
  {
    id: 'codex',
    Icon: Bot,
    active: 'border-purple-500/60 bg-gradient-to-br from-purple-950/30 via-zinc-900/60 to-zinc-900/40 shadow-lg shadow-purple-500/10',
    iconClass: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
  },
  {
    id: 'claude',
    Icon: Asterisk,
    active: 'border-amber-500/60 bg-gradient-to-br from-amber-950/30 via-zinc-900/60 to-zinc-900/40 shadow-lg shadow-amber-500/10',
    iconClass: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
  },
];

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
  toggleFastMode,
  availability = {},
  onRefreshAvailability,
}) {
  if (!isOpen) return null;

  const checking = Object.values(availability).some((entry) => entry?.status === 'checking');

  const currentProviderConfig = PROVIDERS[provider];
  const activeModelId = models[provider] || currentProviderConfig.defaultModel;
  const activeReasoning = reasoningEfforts[provider] || currentProviderConfig.defaultReasoning;
  const accent = ACCENTS[provider] || ACCENTS.antigravity;
  const levelCount = currentProviderConfig.reasoningLevels.length;

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/60">
          <h2 className="text-lg font-bold text-white tracking-tight">Modelo de IA</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Provider */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Provedor
              </label>
              {onRefreshAvailability && (
                <button
                  type="button"
                  onClick={onRefreshAvailability}
                  disabled={checking}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-default cursor-pointer"
                >
                  <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
                  {checking ? 'Verificando…' : 'Verificar novamente'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PROVIDER_OPTIONS.map(({ id, Icon, active, iconClass }) => {
                const reason = unavailableReason(availability, id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setProvider(id)}
                    disabled={Boolean(reason)}
                    title={reason || undefined}
                    className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex items-center gap-2.5 ${
                      reason
                        ? 'border-zinc-800/60 bg-zinc-900/20 opacity-50 cursor-not-allowed'
                        : provider === id
                          ? `${active} cursor-pointer`
                          : 'border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-850 hover:border-zinc-700 cursor-pointer'
                    }`}
                  >
                    <div className={`w-8 h-8 shrink-0 rounded-xl border flex items-center justify-center ${iconClass}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white">{PROVIDERS[id].name}</h3>
                      {reason && <p className="text-[10px] text-rose-300 truncate">Indisponível</p>}
                      {availability[id]?.status === 'checking' && <p className="text-[10px] text-zinc-500">Verificando…</p>}
                    </div>
                    {provider === id && !reason && (
                      <span className="ml-auto w-5 h-5 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {PROVIDER_OPTIONS.map(({ id }) => {
              const reason = unavailableReason(availability, id);
              const unverified = availability[id]?.status === 'unknown' ? availability[id].reason : null;
              if (!reason && !unverified) return null;
              return (
                <p key={id} className={`mt-2 text-[11px] ${reason ? 'text-rose-300/90' : 'text-zinc-500'}`}>
                  <span className="font-semibold">{PROVIDERS[id].name}:</span> {reason || `${unverified} O provedor continua liberado.`}
                </p>
              );
            })}
          </div>

          {/* Model */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 block">
              Modelo
            </label>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {currentProviderConfig.models.map((mod) => {
                const reason = unavailableReason(availability, provider, mod.id, mod.name);
                const isSelected = mod.id === activeModelId && !reason;
                return (
                  <div
                    key={mod.id}
                    onClick={reason ? undefined : () => setModel(mod.id, provider)}
                    aria-disabled={Boolean(reason)}
                    title={reason || undefined}
                    className={`p-3 rounded-xl border flex items-center gap-3 transition ${
                      reason
                        ? 'border-zinc-800/50 bg-zinc-900/10 text-zinc-500 opacity-60 cursor-not-allowed'
                        : isSelected
                          ? `${accent.selected} cursor-pointer`
                          : 'border-zinc-800/80 bg-zinc-900/30 hover:bg-zinc-900/70 text-zinc-300 cursor-pointer'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? accent.radio : 'border-zinc-700 bg-zinc-900'
                      }`}
                    >
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                    </div>
                    <span className="font-semibold text-xs sm:text-sm">{mod.name}</span>
                    {reason && <span className="ml-auto text-[10px] text-zinc-500">Indisponível na sua conta</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reasoning Effort */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2.5 block">
              Raciocínio
            </label>

            <div className={`grid gap-2 ${levelCount > 3 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-3'}`}>
              {currentProviderConfig.reasoningLevels.map((lvl, levelIndex) => {
                const isSelected = lvl.id === activeReasoning;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setReasoningEffort(lvl.id, provider)}
                    className={`py-2.5 px-3 rounded-xl border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 shadow-md shadow-amber-500/5'
                        : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex gap-0.5 items-end h-3">
                      {currentProviderConfig.reasoningLevels.map((_, barIndex) => (
                        <span
                          key={barIndex}
                          className={`w-1 rounded-full bg-current ${barIndex > levelIndex ? 'opacity-30' : ''}`}
                          style={{ height: `${4 + (barIndex * 8) / Math.max(1, levelCount - 1)}px` }}
                        />
                      ))}
                    </div>
                    <span className="font-bold text-xs">{lvl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fast Mode (Codex Only) */}
          {provider === 'codex' && (
            <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Zap size={18} className={fastMode ? 'text-blue-300' : 'text-zinc-400'} />
                <h4 className="text-sm font-bold text-white">Fast Mode</h4>
              </div>

              <button
                type="button"
                onClick={toggleFastMode}
                className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  fastMode ? 'bg-blue-500' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-zinc-950 shadow-lg ring-0 transition duration-200 ease-in-out ${
                    fastMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-950/80 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition cursor-pointer"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
