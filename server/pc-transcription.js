import { StreamingTranscription } from '../shared/streaming-transcription.js';

export function wirePcTranscription(engine, { transcribe, getLanguage, broadcast, onFinal, onPartial = () => {}, onCancel = () => {} }) {
  const sessions = new Map();
  let requestTail = Promise.resolve();

  function sessionFor(chunk) {
    if (sessions.has(chunk.utteranceId)) return sessions.get(chunk.utteranceId);
    const language = getLanguage();
    const session = new StreamingTranscription({
      transcribe: (wav, signal) => {
        const request = requestTail.then(() => {
          if (signal.aborted) throw new Error('Transcrição cancelada');
          return transcribe(wav, language, { signal });
        });
        requestTail = request.catch(() => {});
        return request;
      },
      onPartial: (text) => {
        broadcast({ type: 'pc_speech_partial', text, utteranceId: chunk.utteranceId, timestamp: Date.now() });
        onPartial(text, chunk.utteranceId);
      },
      onFinal: (text) => {
        broadcast({ type: 'pc_speech_transcribed', text, utteranceId: chunk.utteranceId, durationSec: session.durationSec, timestamp: Date.now() });
        onFinal(text, chunk.utteranceId);
      },
      onError: (error) => {
        broadcast({ type: 'pc_speech_error', error, utteranceId: chunk.utteranceId });
        onCancel(chunk.utteranceId);
      },
    });
    sessions.set(chunk.utteranceId, session);
    if (sessions.size > 4) {
      session.fail('O serviço de transcrição não está acompanhando as falas. Tente novamente.');
    }
    // Keep failed utterances until their final marker, so later chunks cannot
    // accidentally resurrect an incomplete transcript and send it to the agent.
    return session;
  }

  engine.on('speech_start', (event) => broadcast({ type: 'pc_speech_start', ...event }));
  engine.on('speech_end', (event) => {
    broadcast({ type: 'pc_speech_end', ...event });
    if (event.discarded) {
      sessions.get(event.utteranceId)?.cancel();
      onCancel(event.utteranceId);
      sessions.delete(event.utteranceId);
    }
  });
  engine.on('speech_chunk', (chunk) => sessionFor(chunk).push(chunk));
  engine.on('speech_segment', (chunk) => {
    const session = sessionFor(chunk);
    session.durationSec = chunk.durationSec;
    if (!session.cancelled) broadcast({ type: 'pc_speech_processing', durationSec: chunk.durationSec, utteranceId: chunk.utteranceId });
    session.push({ ...chunk, final: true });
    session.done.then(() => sessions.delete(chunk.utteranceId));
  });

  function cancel() {
    for (const [id, session] of sessions) { session.cancel(); onCancel(id); }
    sessions.clear();
  }
  engine.on('status', (status) => {
    if (!status.isCapturing) cancel();
  });
  return { cancel };
}
