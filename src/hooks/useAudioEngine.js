import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to capture live audio frequency and volume data via Web Audio API.
 * Provides real-time frequency bar heights and volume level for the Perssua waveform and audio meters.
 */
export function useAudioEngine(isRecording) {
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const [frequencyBars, setFrequencyBars] = useState(() => Array(48).fill(15));
  const [hasMicPermission, setHasMicPermission] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const initAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setHasMicPermission(true);
      return true;
    } catch (err) {
      console.warn('[useAudioEngine] Mic permission not granted or audio error:', err);
      setHasMicPermission(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let active = true;

    if (isRecording) {
      if (!audioContextRef.current) {
        initAudio();
      } else if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const updateData = () => {
        if (!active) return;

        if (analyserRef.current) {
          const bufferLength = analyserRef.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate overall volume level
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          const normalizedLevel = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(normalizedLevel);

          // Generate 48 bars based on frequency bins
          const barsCount = 48;
          const step = Math.max(1, Math.floor(bufferLength / barsCount));
          const newBars = [];

          for (let i = 0; i < barsCount; i++) {
            const rawVal = dataArray[(i * step) % bufferLength] || 0;
            // Scale between 12% min and 95% max height
            const heightPercent = Math.max(12, Math.min(96, (rawVal / 255) * 100));
            newBars.push(heightPercent);
          }
          setFrequencyBars(newBars);
        } else {
          // Simulated pulsing bars if mic is not yet initialized
          const time = Date.now() / 200;
          const simulatedBars = Array.from({ length: 48 }, (_, i) => {
            const val = Math.sin(time + i * 0.3) * 35 + 45;
            return Math.max(15, Math.min(90, val));
          });
          setFrequencyBars(simulatedBars);
          setAudioLevel(35);
        }

        animationFrameRef.current = requestAnimationFrame(updateData);
      };

      updateData();
    } else {
      // Idle state
      setAudioLevel(0);
      setFrequencyBars(Array(48).fill(12));
    }

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, initAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    audioLevel,
    frequencyBars,
    hasMicPermission,
  };
}
