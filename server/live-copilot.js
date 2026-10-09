// Transcription stays live, but only a consolidated utterance may use the
// model. Partial questions otherwise generate off-topic replies and make the
// complete question wait behind speculative work.
export function createLiveCopilot({ start, enabled = () => true, canStart = () => true,
  onFinalized = () => {}, onDiscarded = () => {} }) {
  const entries = new Map();
  const superseded = new Set();
  let running = null;
  let timer = null;

  function eligible(entry) {
    return entry.final && entry.text !== entry.sentText;
  }

  function latestPending() {
    return [...entries.values()].reverse().find(eligible);
  }

  function retire(entry) {
    entries.delete(entry.id);
    superseded.add(entry.id);
    if (superseded.size > 64) superseded.delete(superseded.values().next().value);
    onDiscarded(entry.id);
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (running || !enabled()) return;
    const next = latestPending();
    if (!next) return;
    timer = setTimeout(drain, 0);
  }

  function drain() {
    timer = null;
    if (running || !enabled()) return;
    if (!canStart()) { timer = setTimeout(drain, 500); return; }
    const entry = latestPending();
    if (!entry) return;
    // Once the model falls behind, answer the current question rather than
    // serially generating obsolete snapshots. The transcript history stays intact.
    for (const older of [...entries.values()]) {
      if (older === entry) break;
      retire(older);
    }
    entry.sentText = entry.text;
    const job = { entry, handle: null };
    running = job;
    const settle = () => {
      if (running !== job) return;
      running = null;
      if (entry.final && entry.text === entry.sentText) {
        entries.delete(entry.id);
        onFinalized(entry.id);
      }
      schedule();
    };
    try {
      job.handle = start({ text: entry.sentText, utteranceId: entry.id,
        isPreview: () => !entry.final || entry.text !== entry.sentText, onSettled: settle });
    } catch { settle(); }
  }

  function cancel(utteranceId) {
    const selected = utteranceId ? entries.get(utteranceId) : null;
    const discarded = utteranceId ? (selected ? [selected] : []) : [...entries.values()];
    if (utteranceId) entries.delete(utteranceId);
    else entries.clear();
    if (running && (!utteranceId || running.entry === selected)) {
      const job = running;
      running = null;
      job.handle?.kill();
    }
    for (const entry of discarded) onDiscarded(entry.id);
    schedule();
  }

  function update(text, utteranceId, final = false) {
    if (!enabled() || !text?.trim()) return;
    const id = utteranceId || 'legacy';
    if (superseded.has(id)) return;
    let entry = entries.get(id);
    if (!entry) {
      entry = { id, text: '', sentText: null, final: false };
      entries.set(id, entry);
      // Bounded pending context when the provider cannot keep up with speakers.
      if (entries.size > 4) {
        const oldestPending = [...entries.values()].find((candidate) => candidate !== running?.entry && candidate !== entry);
        if (oldestPending) retire(oldestPending);
      }
    }
    entry.text = text.trim();
    entry.final = final;
    if (final && entry.text === entry.sentText) {
      onFinalized(id);
      if (running?.entry !== entry) entries.delete(id);
    }
    schedule();
  }

  return { partial: (text, id) => update(text, id), final: (text, id) => update(text, id, true), cancel };
}
