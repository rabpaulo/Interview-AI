// Streaming speech-to-text for the PC audio. With a key, the transcript updates
// word by word (server/deepgram-transcriber.js); without one, or when the service
// fails, the free recognizer in server/transcribe.py keeps working as before.
export const SPEECH_PROVIDERS = {
  deepgram: {
    id: 'deepgram',
    name: 'Deepgram',
    shortName: 'Deepgram',
    tagline: 'Transcrição do PC em tempo real (Nova-3)',
    env: ['DEEPGRAM_API_KEY'],
    keyUrl: 'https://console.deepgram.com/',
  },
};

export const SPEECH_PROVIDER_LIST = Object.values(SPEECH_PROVIDERS);

export const isSpeechProvider = (id) => Object.hasOwn(SPEECH_PROVIDERS, id);
