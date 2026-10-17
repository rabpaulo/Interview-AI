import { StreamingTranscription, createWav } from '../shared/streaming-transcription.js';
import { createUtteranceLanguage, LANGUAGES } from '../shared/language.js';
import { MIN_PREVIEW_WORDS } from './live-copilot.js';

const wordCount = (text) => text.split(/\s+/).filter(Boolean).length;

// `live` is an optional streaming recognizer (server/deepgram-transcriber.js). When it
// is available, an utterance streams its PCM there and the transcript grows word by
// word; otherwise, or when it fails, the windowed recognizer (`transcribe`) runs.
// Streamed partials reach the screen at once, but the live responder gets a longer
// one at most every `copilotPartialMs`, unless the speaker paused: each one restarts
// the preview, and restarts every few hundred ms would never let one finish.
export function wirePcTranscription(engine, { transcribe, live = null, getLanguage, broadcast, onFinal,
  onPartial = () => {}, onCancel = () => {}, copilotPartialMs = 2000 }) {
  const sessions = new Map();
  const liveSessions = new Map();
  let requestTail = Promise.resolve();
  let lastLanguage = null;

  // Requests to the windowed recognizer run one at a time, in order.
  function request(wav, language, signal) {
    const result = requestTail.then(() => {
      if (signal.aborted) throw new Error('Transcrição cancelada');
      return transcribe(wav, language.request, { signal });
    }).then((value) => language.observe(value));
    requestTail = result.catch(() => {});
    return result;
  }

  function startLive(utteranceId) {
    const setting = getLanguage();
    const language = createUtteranceLanguage(setting, lastLanguage);
    const controller = new AbortController();
    const audio = [];
    let failed = false;
    let cancelled = false;
    let lastForward = -Infinity;
    let forwardTimer = null;
    let pending = null;

    const forward = (text, paced) => {
      clearTimeout(forwardTimer);
      forwardTimer = null;
      pending = null;
      if (paced) lastForward = Date.now();
      onPartial(text, utteranceId);
    };
    const stream = live.start({
      language: setting,
      preferred: lastLanguage,
      onPartial: (text, { settled }) => {
        if (cancelled) return;
        broadcast({ type: 'pc_speech_partial', text, utteranceId, timestamp: Date.now() });
        // Too short to start a preview: only the notes lookup uses it.
        if (wordCount(text) < MIN_PREVIEW_WORDS) return onPartial(text, utteranceId);
        const wait = lastForward + copilotPartialMs - Date.now();
        if (settled || wait <= 0) return forward(text, true);
        pending = text;
        forwardTimer ||= setTimeout(() => forward(pending, true), wait);
      },
      onError: (error) => {
        failed = true;
        console.warn(`[PC] Streaming transcription failed, finishing this utterance with the standard recognizer: ${error}`);
      },
    });

    const session = {
      write(pcm) {
        audio.push(pcm);
        if (!failed) stream.write(pcm);
      },
      async finish(durationSec) {
        clearTimeout(forwardTimer);
        forwardTimer = null;
        broadcast({ type: 'pc_speech_processing', durationSec, utteranceId });
        let result = await stream.finish();
        if (cancelled) return;
        if (result.error) {
          // The audio is all here: one request to the free recognizer still
          // produces the answer, only without word-by-word partials.
          const wav = Buffer.from(createWav(Buffer.concat(audio)));
          result = await request(wav, language, controller.signal)
            .catch((error) => ({ error: error.message }));
          if (cancelled) return;
          result = { ...result, language: language.detected };
        }
        liveSessions.delete(utteranceId);
        const text = result.text?.trim();
        if (!text) {
          broadcast({ type: 'pc_speech_error', error: result.error || 'Não foi possível entender o áudio', utteranceId });
          onCancel(utteranceId);
          return;
        }
        if (LANGUAGES.includes(result.language)) lastLanguage = result.language;
        broadcast({ type: 'pc_speech_transcribed', text, language: result.language || null, utteranceId, durationSec, timestamp: Date.now() });
        onFinal(text, utteranceId);
      },
      cancel() {
        cancelled = true;
        clearTimeout(forwardTimer);
        controller.abort();
        stream.cancel();
        liveSessions.delete(utteranceId);
      },
    };
    liveSessions.set(utteranceId, session);
  }

  function sessionFor(chunk) {
    if (sessions.has(chunk.utteranceId)) return sessions.get(chunk.utteranceId);
    const language = createUtteranceLanguage(getLanguage(), lastLanguage);
    const session = new StreamingTranscription({
      transcribe: (wav, signal) => request(wav, language, signal),
      onPartial: (text) => {
        broadcast({ type: 'pc_speech_partial', text, utteranceId: chunk.utteranceId, timestamp: Date.now() });
        onPartial(text, chunk.utteranceId);
      },
      onFinal: (text) => {
        if (language.detected) lastLanguage = language.detected;
        broadcast({ type: 'pc_speech_transcribed', text, language: language.detected, utteranceId: chunk.utteranceId, durationSec: session.durationSec, timestamp: Date.now() });
        onFinal(text, chunk.utteranceId);
      },
      onError: (error) => {
        broadcast({ type: 'pc_speech_error', error, utteranceId: chunk.utteranceId });
        onCancel(chunk.utteranceId);
        // Without this, a long utterance keeps feeding the failed session and
        // nothing more is transcribed until the PC audio goes quiet.
        engine.abandonSpeech?.(chunk.utteranceId);
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

  engine.on('speech_start', (event) => {
    broadcast({ type: 'pc_speech_start', ...event });
    if (live?.available()) startLive(event.utteranceId);
  });
  engine.on('speech_audio', ({ utteranceId, pcm }) => liveSessions.get(utteranceId)?.write(pcm));
  engine.on('speech_end', (event) => {
    broadcast({ type: 'pc_speech_end', ...event });
    if (event.discarded) {
      liveSessions.get(event.utteranceId)?.cancel();
      sessions.get(event.utteranceId)?.cancel();
      onCancel(event.utteranceId);
      sessions.delete(event.utteranceId);
    }
  });
  engine.on('speech_chunk', (chunk) => {
    if (!liveSessions.has(chunk.utteranceId)) sessionFor(chunk).push(chunk);
  });
  engine.on('speech_segment', (chunk) => {
    const streamed = liveSessions.get(chunk.utteranceId);
    if (streamed) return streamed.finish(chunk.durationSec);
    const session = sessionFor(chunk);
    session.durationSec = chunk.durationSec;
    if (!session.cancelled) broadcast({ type: 'pc_speech_processing', durationSec: chunk.durationSec, utteranceId: chunk.utteranceId });
    session.push({ ...chunk, final: true });
    session.done.then(() => sessions.delete(chunk.utteranceId));
  });

  function cancel() {
    for (const [id, session] of liveSessions) { session.cancel(); onCancel(id); }
    for (const [id, session] of sessions) { session.cancel(); onCancel(id); }
    sessions.clear();
  }
  engine.on('status', (status) => {
    if (status.isCapturing) live?.warm(getLanguage());
    else {
      cancel();
      live?.close();
    }
  });
  return { cancel };
}
