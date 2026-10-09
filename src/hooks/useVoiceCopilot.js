import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Unified Voice Copilot Hook
 * Combines:
 * 1. Web Audio API (live decibels & waveform frequencies)
 * 2. MediaRecorder (high-fidelity audio recording across ALL browsers)
 * 3. Web Speech API (instant interim preview if available)
 * 4. Automatic backend /api/transcribe fallback if Web Speech is unavailable
 * 5. Spacebar Push-To-Talk
 */
export function useVoiceCopilot({
  language = 'pt-BR',
  onFinalTranscript,
  enabled = true,
}) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyBars, setFrequencyBars] = useState(() => Array(48).fill(12));
  const [micPermission, setMicPermission] = useState('prompt'); // 'prompt' | 'granted' | 'denied'
  const [errorMessage, setErrorMessage] = useState(null);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);

  // Audio refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const animationFrameRef = useRef(null);

  // Speech Recognition refs
  const recognitionRef = useRef(null);
  const speechRecognizedTextRef = useRef('');
  const isListeningRef = useRef(false);

  // Initialize Microphone & Web Audio Analyzer
  const getOrCreateStream = useCallback(async () => {
    if (mediaStreamRef.current && mediaStreamRef.current.active) {
      return mediaStreamRef.current;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não suporta captura de áudio (getUserMedia).');
      }

      console.log('[VoiceCopilot] Requesting microphone permission...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      setMicPermission('granted');
      setErrorMessage(null);

      // Setup AudioContext & Analyser
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      return stream;
    } catch (err) {
      console.error('[VoiceCopilot] Mic permission error:', err);
      setMicPermission('denied');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Permissão do microfone negada. Clique no ícone de cadeado do navegador para permitir.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('Nenhum microfone encontrado conectado ao computador.');
      } else {
        setErrorMessage(`Erro ao acessar microfone: ${err.message}`);
      }
      return null;
    }
  }, []);

  // Web Audio visualizer animation loop
  const startVisualizer = useCallback(() => {
    let active = true;

    const updateVisualizer = () => {
      if (!active || !isListeningRef.current) return;

      if (analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);

        const barsCount = 48;
        const step = Math.max(1, Math.floor(bufferLength / barsCount));
        const newBars = [];

        for (let i = 0; i < barsCount; i++) {
          const rawVal = dataArray[(i * step) % bufferLength] || 0;
          const heightPercent = Math.max(12, Math.min(96, (rawVal / 255) * 100));
          newBars.push(heightPercent);
        }
        setFrequencyBars(newBars);
      } else {
        // Fallback pulsing animation
        const time = Date.now() / 150;
        const bars = Array.from({ length: 48 }, (_, i) => {
          const val = Math.sin(time + i * 0.28) * 35 + 40;
          return Math.max(15, Math.min(90, val));
        });
        setFrequencyBars(bars);
        setAudioLevel(40);
      }

      animationFrameRef.current = requestAnimationFrame(updateVisualizer);
    };

    updateVisualizer();

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    if (isListeningRef.current) return;

    setErrorMessage(null);
    speechRecognizedTextRef.current = '';
    setInterimTranscript('');
    recordedChunksRef.current = [];

    const stream = await getOrCreateStream();
    if (!stream) {
      console.warn('[VoiceCopilot] Could not start recording without audio stream');
      return;
    }

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    isListeningRef.current = true;
    setIsListening(true);
    startVisualizer();

    // 1. Start MediaRecorder
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
        ? 'audio/ogg'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      console.log('[VoiceCopilot] MediaRecorder started with mime:', recorder.mimeType);
    } catch (e) {
      console.warn('[VoiceCopilot] MediaRecorder error:', e);
    }

    // 2. Start Web Speech API if supported for live interim preview
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch {}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onresult = (event) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const part = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += part;
            } else {
              interim += part;
            }
          }

          if (interim) setInterimTranscript(interim);
          if (final) {
            speechRecognizedTextRef.current += ' ' + final;
            setInterimTranscript(speechRecognizedTextRef.current.trim());
          }
        };

        recognition.onerror = (event) => {
          console.warn('[VoiceCopilot] SpeechRecognition event error:', event.error);
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('[VoiceCopilot] Could not start browser SpeechRecognition:', err);
      }
    }
  }, [getOrCreateStream, startVisualizer, language]);

  // Stop recording and process transcript
  const stopRecording = useCallback(async () => {
    if (!isListeningRef.current) return;

    isListeningRef.current = false;
    setIsListening(false);
    setAudioLevel(0);
    setFrequencyBars(Array(48).fill(12));

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Stop Web Speech API
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    // Stop MediaRecorder and handle audio blob
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = async () => {
        const browserText = speechRecognizedTextRef.current.trim();
        const interimText = interimTranscript.trim();
        const finalCandidate = browserText || interimText;

        // If Web Speech API captured text successfully, use it!
        if (finalCandidate) {
          console.log('[VoiceCopilot] Using browser Web Speech transcript:', finalCandidate);
          onFinalTranscript?.(finalCandidate);
          setInterimTranscript('');
          speechRecognizedTextRef.current = '';
          return;
        }

        // Otherwise, send recorded audio blob to backend /api/transcribe
        if (recordedChunksRef.current.length > 0) {
          try {
            setIsTranscribing(true);
            setInterimTranscript('Transcrevendo áudio com o servidor...');

            const blob = new Blob(recordedChunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            });

            console.log(`[VoiceCopilot] Sending audio blob (${blob.size} bytes) to /api/transcribe...`);

            const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(language)}`, {
              method: 'POST',
              headers: {
                'Content-Type': blob.type || 'audio/webm',
              },
              body: blob,
            });

            const data = await res.json();
            setIsTranscribing(false);
            setInterimTranscript('');

            if (data.text?.trim()) {
              console.log('[VoiceCopilot] Server transcribed:', data.text);
              onFinalTranscript?.(data.text.trim());
            } else if (data.error) {
              console.warn('[VoiceCopilot] Transcribe error:', data.error);
              setErrorMessage(`Transcrição: ${data.error}`);
              setTimeout(() => setErrorMessage(null), 4000);
            }
          } catch (err) {
            console.error('[VoiceCopilot] Server transcribe fetch error:', err);
            setIsTranscribing(false);
            setInterimTranscript('');
            setErrorMessage('Não foi possível transcrever o áudio gravado.');
            setTimeout(() => setErrorMessage(null), 4000);
          }
        }
      };

      try {
        recorder.stop();
      } catch (e) {
        console.error('Error stopping recorder:', e);
      }
    } else {
      // Fallback if recorder was not active
      const text = speechRecognizedTextRef.current.trim() || interimTranscript.trim();
      if (text) {
        onFinalTranscript?.(text);
        setInterimTranscript('');
        speechRecognizedTextRef.current = '';
      }
    }
  }, [interimTranscript, language, onFinalTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isListening, startRecording, stopRecording]);

  // Spacebar Push-to-Talk
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      if (e.code === 'Space' && !e.repeat && !isPushToTalkActive) {
        e.preventDefault();
        setIsPushToTalkActive(true);
        startRecording();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && isPushToTalkActive) {
        e.preventDefault();
        setIsPushToTalkActive(false);
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, isPushToTalkActive, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch {}
      }
    };
  }, []);

  return {
    isListening,
    isTranscribing,
    interimTranscript,
    audioLevel,
    frequencyBars,
    micPermission,
    errorMessage,
    clearError: () => setErrorMessage(null),
    isPushToTalkActive,
    toggleListening,
    startRecording,
    stopRecording,
  };
}
