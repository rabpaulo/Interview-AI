import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for Speech Recognition using the browser's Web Speech API.
 * Supports real-time interim results in pt-BR and Push-to-Talk via keyboard.
 */
export function useSpeechRecognition({
  language = 'pt-BR',
  onFinalTranscript,
  enabled = true,
}) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastFinalTranscript, setLastFinalTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const currentTextRef = useRef('');

  // Check browser support
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      console.warn('SpeechRecognition is not supported in this browser.');
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    setIsListening(false);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimTranscript('');
      currentTextRef.current = '';
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcriptPart;
        } else {
          interim += transcriptPart;
        }
      }

      setInterimTranscript(interim);

      if (final.trim()) {
        currentTextRef.current = final.trim();
        setLastFinalTranscript(final.trim());
        onFinalTranscript?.(final.trim());
        setInterimTranscript('');
      } else if (interim.trim()) {
        currentTextRef.current = interim.trim();
        // Reset silence timer: if user stops talking for 2.2 seconds, treat interim as final
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (currentTextRef.current.trim()) {
            const captured = currentTextRef.current.trim();
            setLastFinalTranscript(captured);
            onFinalTranscript?.(captured);
            setInterimTranscript('');
            currentTextRef.current = '';
          }
        }, 2200);
      }
    };

    recognition.onerror = (event) => {
      console.warn('[SpeechRecognition Error]:', event.error);
      if (event.error === 'not-allowed') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // If we still have uncommitted text, send it
      if (currentTextRef.current.trim()) {
        const captured = currentTextRef.current.trim();
        setLastFinalTranscript(captured);
        onFinalTranscript?.(captured);
        currentTextRef.current = '';
        setInterimTranscript('');
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
    }
  }, [language, onFinalTranscript]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Push-to-Talk via Spacebar (when not typing in an input/textarea)
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
        return;
      }

      if (e.code === 'Space' && !e.repeat && !isPushToTalkActive) {
        e.preventDefault();
        setIsPushToTalkActive(true);
        startListening();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && isPushToTalkActive) {
        e.preventDefault();
        setIsPushToTalkActive(false);
        stopListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled, isPushToTalkActive, startListening, stopListening]);

  return {
    isListening,
    interimTranscript,
    lastFinalTranscript,
    isSupported,
    isPushToTalkActive,
    startListening,
    stopListening,
    toggleListening,
  };
}
