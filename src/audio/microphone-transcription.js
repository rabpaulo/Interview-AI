import workletUrl from './pcm-capture.worklet.js?url';
import { PcmChunker, StreamingTranscription } from '../../shared/streaming-transcription.js';

const loadedContexts = new WeakSet();

export async function startMicrophoneTranscription(context, stream, { language, onPartial }) {
  if (!context.audioWorklet) throw new Error('AudioWorklet indisponível');
  if (!loadedContexts.has(context)) {
    await context.audioWorklet.addModule(workletUrl);
    loadedContexts.add(context);
  }
  const session = new StreamingTranscription({
    transcribe: async (wav, signal) => {
      const response = await fetch(`/api/transcribe?lang=${encodeURIComponent(language)}`, {
        method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav, signal,
      });
      if (!response.ok) throw new Error('Falha ao acessar o serviço de transcrição');
      return response.json();
    },
    onPartial,
  });
  const chunker = new PcmChunker((chunk) => session.push(chunk));
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'pcm-capture');
  const muted = context.createGain();
  muted.gain.value = 0;
  let flush;
  let disconnected = false;
  function disconnect() {
    if (disconnected) return;
    disconnected = true;
    source.disconnect();
    node.disconnect();
    muted.disconnect();
    node.port.close();
  }
  node.port.onmessage = ({ data }) => {
    if (data.type === 'pcm') chunker.push(new Uint8Array(data.buffer));
    if (data.type === 'flushed') flush?.();
  };
  node.onprocessorerror = () => { session.cancel(); flush?.(); disconnect(); };
  source.connect(node);
  node.connect(muted);
  muted.connect(context.destination);

  return {
    async finish() {
      if (!disconnected) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => { session.cancel(); resolve(); }, 1000);
          flush = () => { clearTimeout(timer); resolve(); };
          node.port.postMessage('flush');
        });
        chunker.finish();
        disconnect();
      }
      return session.done;
    },
    cancel() { session.cancel(); flush?.(); disconnect(); },
  };
}
