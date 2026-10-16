// Availability per provider: { status: 'checking' | 'available' | 'unknown' | 'unavailable', reason?, models? }.
// `models` lists the ids the account offers; null means the CLI cannot list them,
// so every model of an available provider is allowed. "unknown" (the check itself
// failed) stays usable: only a definite answer blocks a provider.

const EFFORT_SUFFIX = /-(low|medium|high|xhigh|max)$/;

// Antigravity lists each model once per effort (gemini-3.8-flash-low), so a base id
// matches any of them.
export function modelListed(entry, modelId) {
  if (!Array.isArray(entry?.models)) return true;
  return entry.models.some((id) => id === modelId || id.replace(EFFORT_SUFFIX, '') === modelId);
}

/** Why a provider (or one of its models) cannot be used; null while unknown or usable. */
export function unavailableReason(availability, provider, modelId, modelName = modelId) {
  const entry = availability?.[provider];
  if (!entry || entry.status === 'checking' || entry.status === 'unknown') return null;
  if (entry.status === 'unavailable') return entry.reason || 'Provedor indisponível.';
  if (modelId && !modelListed(entry, modelId)) return `O modelo ${modelName} não está disponível na sua conta.`;
  return null;
}

/**
 * Replacement for an unavailable selection: another model of the same provider,
 * then another provider (its default model first). Null when the selection is usable
 * or nothing else is.
 */
export function availableSelection(availability, providers, provider, modelId) {
  if (!unavailableReason(availability, provider, modelId)) return null;
  const usableModel = (id) => {
    if (unavailableReason(availability, id)) return null;
    const config = providers[id];
    const ordered = [config.models.find((model) => model.id === config.defaultModel), ...config.models].filter(Boolean);
    return ordered.find((model) => !unavailableReason(availability, id, model.id)) || null;
  };
  for (const id of [provider, ...Object.keys(providers).filter((other) => other !== provider)]) {
    const model = usableModel(id);
    if (model) return { provider: id, model: model.id, modelName: model.name };
  }
  return null;
}
