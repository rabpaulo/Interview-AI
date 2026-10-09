import { spawn, execSync } from 'child_process';
import EventEmitter from 'events';
import { PcmChunker } from '../shared/streaming-transcription.js';

/**
 * SystemAudioEngine
 * Captures native system/PC audio loopback on Linux using PulseAudio/PipeWire (parec).
 * Emits:
 * - 'level': { level: number (0-100), rms: number } (emitted ~30 times/sec)
 * - 'speech_start': { utteranceId, timestamp }
 * - 'speech_chunk': { utteranceId, wavBuffer, sequence } (while speaking)
 * - 'speech_segment': { wavBuffer: Buffer, durationSec: number }
 * - 'status': { isCapturing: boolean, sink: string }
 * - 'error': (err)
 */
export class SystemAudioEngine extends EventEmitter {
  constructor() {
    super();
    this.captureProcess = null;
    this.isCapturing = false;
    this.currentSink = null;

    // VAD (Voice Activity Detection) Parameters
    this.vadThreshold = 14; // RMS threshold percentage (0-100)
    this.silenceMsThreshold = 900; // Silence time in ms to consider speech finished
    this.minSpeechMs = 700; // Minimum speech duration to discard random clicks
    this.preSpeechBufferMs = 200;

    // Internal state
    this.inSpeech = false;
    this.speechChunker = null;
    this.speechTotalBytes = 0;
    this.utteranceId = null;
    this.preSpeechChunks = [];
    this.speechStartTime = null;
    this.lastVoiceDetectedTime = null;
    this.speechVoicedMs = 0;
    this.trailingSilenceBytes = 0;
    this.silenceTimer = null;
    this.silenceFlushTimer = null;
    this.flushedSilenceBytes = 0;
    this.nextSpeechId = 0;
    this.sampleRate = 16000;
    this.bytesPerSample = 2; // 16-bit PCM = 2 bytes
    this.channels = 1;
  }

  /**
   * Discovers available audio output sinks and the current default sink.
   */
  static listAudioSinks() {
    try {
      let defaultSink = '';
      try {
        defaultSink = execSync('pactl get-default-sink', { encoding: 'utf-8' }).trim();
      } catch (e) {
        console.warn('[SystemAudio] Could not get default sink via pactl:', e.message);
      }

      let sinksOutput = '';
      try {
        sinksOutput = execSync('pactl list short sinks', { encoding: 'utf-8' });
      } catch (e) {
        console.warn('[SystemAudio] Could not list sinks via pactl:', e.message);
      }

      const sinks = [];
      const lines = sinksOutput.split('\n').filter(Boolean);

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const name = parts[1];
          const isDefault = name === defaultSink;
          sinks.push({
            id: parts[0],
            name,
            monitorSource: `${name}.monitor`,
            isDefault,
            description: SystemAudioEngine.formatSinkDescription(name),
          });
        }
      }

      return {
        defaultSink,
        sinks: sinks.length > 0 ? sinks : [
          {
            id: '0',
            name: defaultSink || '@DEFAULT_SINK@',
            monitorSource: defaultSink ? `${defaultSink}.monitor` : '@DEFAULT_SINK@.monitor',
            isDefault: true,
            description: 'Dispositivo de Áudio Padrão do Sistema',
          },
        ],
      };
    } catch (err) {
      console.error('[SystemAudio] Error listing audio sinks:', err);
      return { defaultSink: '@DEFAULT_SINK@', sinks: [] };
    }
  }

  static formatSinkDescription(sinkName) {
    if (sinkName.includes('bluez')) return 'Fone / Caixa Bluetooth';
    if (sinkName.includes('fifine')) return 'Microfone/Headset Fifine USB';
    if (sinkName.includes('hdmi')) return 'Saída HDMI / Monitor';
    if (sinkName.includes('iec958') || sinkName.includes('analog-stereo')) return 'Áudio Analógico / Placa Mãe';
    return sinkName;
  }

  /**
   * Starts loopback capturing from the specified sink or the system default sink.
   */
  startCapture(options = {}) {
    const {
      sink = null,
      vadThreshold = 14,
      silenceMsThreshold = 900,
      minSpeechMs = 700,
    } = options;

    this.vadThreshold = vadThreshold;
    this.silenceMsThreshold = silenceMsThreshold;
    this.minSpeechMs = minSpeechMs;

    let targetMonitor = '';
    if (sink) {
      targetMonitor = sink.endsWith('.monitor') ? sink : `${sink}.monitor`;
    } else {
      const sinksInfo = SystemAudioEngine.listAudioSinks();
      const defaultSink = sinksInfo.defaultSink;
      if (defaultSink) {
        targetMonitor = `${defaultSink}.monitor`;
      } else {
        targetMonitor = '@DEFAULT_SINK@.monitor';
      }
    }

    if (this.isCapturing && this.captureProcess && this.currentSink === targetMonitor) {
      return true;
    }

    if (this.captureProcess) {
      this.stopCapture();
    }

    this.currentSink = targetMonitor;
    console.log(`[SystemAudio] Starting PC audio loopback capture on monitor: ${targetMonitor}`);

    // Spawn parec: 16kHz, mono, 16-bit little-endian
    const args = [
      '-d', targetMonitor,
      '--rate', String(this.sampleRate),
      '--channels', String(this.channels),
      '--format', 's16le',
    ];

    let captureProcess;
    try {
      captureProcess = spawn('parec', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      console.error('[SystemAudio] Failed to spawn parec:', err);
      this.emit('error', err);
      return false;
    }

    this.captureProcess = captureProcess;
    this.isCapturing = true;
    this.inSpeech = false;
    this.clearSpeech();
    this.emit('status', { isCapturing: true, sink: this.currentSink });

    let leftover = Buffer.alloc(0);
    const chunkSize = 1600; // 50 ms of PCM16 mono at 16 kHz

    captureProcess.stdout.on('data', (data) => {
      if (this.captureProcess !== captureProcess) return;
      const combined = Buffer.concat([leftover, data]);
      const fullChunksCount = Math.floor(combined.length / chunkSize);

      for (let i = 0; i < fullChunksCount; i++) {
        const chunk = combined.subarray(i * chunkSize, (i + 1) * chunkSize);
        this.processPcmChunk(chunk);
      }

      leftover = combined.subarray(fullChunksCount * chunkSize);
    });

    captureProcess.stderr.on('data', (data) => {
      const errStr = data.toString().trim();
      if (errStr && !errStr.includes('write() failed')) {
        console.warn(`[SystemAudio parec stderr]:`, errStr);
      }
    });

    captureProcess.on('close', (code) => {
      console.log(`[SystemAudio] parec process exited with code ${code}`);
      if (this.captureProcess !== captureProcess) return;
      this.captureProcess = null;
      this.isCapturing = false;
      this.discardSpeech();
      this.emit('status', { isCapturing: false, sink: this.currentSink });
    });

    captureProcess.on('error', (err) => {
      if (this.captureProcess !== captureProcess) return;
      console.error('[SystemAudio] parec process error:', err);
      this.emit('error', err);
      this.stopCapture();
    });

    return true;
  }

  /**
   * Analyzes a 16-bit mono PCM chunk for volume level & VAD speech segmentation.
   */
  processPcmChunk(chunk) {
    const numSamples = chunk.length / 2;
    if (numSamples === 0) return;

    let sumSquares = 0;
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / numSamples);
    // Normalize to 0-100 percentage (assuming 16-bit max amplitude 32768)
    // Non-linear perceptual scaling
    const normalizedLevel = Math.min(100, Math.round((rms / 32768) * 450));

    this.emit('level', { level: normalizedLevel, rms: Math.round(rms) });

    const now = Date.now();
    const chunkDurationMs = (numSamples / this.sampleRate) * 1000;
    // Use a lower continuation threshold so quiet syllables after the onset
    // count as speech instead of being discarded with the silence tail.
    const threshold = this.inSpeech ? this.vadThreshold / 4 : this.vadThreshold;
    const isAboveThreshold = normalizedLevel >= threshold;

    if (isAboveThreshold) {
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.speechStartTime = now;
        this.speechVoicedMs = 0;
        // Keep a short lead-in so quiet consonants are not clipped by the
        // volume threshold that starts the speech segment.
        const leadIn = Buffer.concat(this.preSpeechChunks);
        this.preSpeechChunks = [];
        const utteranceId = `${now}-${++this.nextSpeechId}`;
        this.utteranceId = utteranceId;
        this.speechTotalBytes = leadIn.length;
        this.speechChunker = new PcmChunker((part) => {
          this.emit(part.final ? 'speech_segment' : 'speech_chunk', {
            ...part,
            wavBuffer: part.wavBuffer ? Buffer.from(part.wavBuffer) : null,
            utteranceId,
            durationSec: (this.speechTotalBytes - this.trailingSilenceBytes)
              / (this.sampleRate * this.bytesPerSample),
            timestamp: Date.now(),
          });
        }, { firstChunkMs: 2000 });
        this.speechChunker.push(leadIn, false);
        this.emit('speech_start', { utteranceId, timestamp: now });
        console.log(`[SystemAudio] 🎙️ Speech detected from PC (level: ${normalizedLevel}%)`);
      }
      this.speechVoicedMs += chunkDurationMs;
      this.trailingSilenceBytes = 0;
      this.flushedSilenceBytes = 0;
      this.speechTotalBytes += chunk.length;
      this.speechChunker.push(chunk, this.speechVoicedMs >= this.minSpeechMs);
      this.lastVoiceDetectedTime = now + chunkDurationMs;

      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      if (this.silenceFlushTimer) clearTimeout(this.silenceFlushTimer);
      this.silenceFlushTimer = null;
    } else {
      if (this.inSpeech) {
        this.speechTotalBytes += chunk.length;
        this.trailingSilenceBytes += chunk.length;
        this.speechChunker.push(chunk, false);

        if (!this.silenceTimer) {
          // Recognition can overlap the pause. Only the existing final timer
          // ends the utterance and allows an AI response to begin.
          this.silenceFlushTimer = setTimeout(() => {
            this.silenceFlushTimer = null;
            if (this.inSpeech && this.speechVoicedMs >= this.minSpeechMs
              && this.speechChunker?.flushPending(this.trailingSilenceBytes)) {
              this.flushedSilenceBytes = this.trailingSilenceBytes;
            }
          }, Math.min(300, this.silenceMsThreshold / 2));
          this.silenceTimer = setTimeout(() => {
            this.finishSpeechSegment();
          }, this.silenceMsThreshold);
        }
      } else {
        this.preSpeechChunks.push(chunk);
        const maxPreSpeechChunks = Math.ceil(this.preSpeechBufferMs / chunkDurationMs);
        if (this.preSpeechChunks.length > maxPreSpeechChunks) {
          this.preSpeechChunks.splice(0, this.preSpeechChunks.length - maxPreSpeechChunks);
        }
      }
    }
  }

  /**
   * Finalizes the current speech segment and creates a WAV buffer for transcription.
   */
  finishSpeechSegment() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    if (!this.inSpeech || !this.speechChunker) return;

    const durationMs = ((this.speechTotalBytes - this.trailingSilenceBytes)
      / (this.sampleRate * this.channels * this.bytesPerSample)) * 1000;
    const valid = durationMs >= this.minSpeechMs && this.speechVoicedMs >= this.minSpeechMs;
    this.inSpeech = false;
    this.emit('speech_end', { utteranceId: this.utteranceId, timestamp: Date.now(), discarded: !valid });
    if (valid) this.speechChunker.finish(this.trailingSilenceBytes - this.flushedSilenceBytes);
    this.clearSpeech();
  }

  clearSpeech() {
    if (this.silenceFlushTimer) clearTimeout(this.silenceFlushTimer);
    this.silenceFlushTimer = null;
    this.flushedSilenceBytes = 0;
    this.speechChunker = null;
    this.preSpeechChunks = [];
    this.speechTotalBytes = 0;
    this.utteranceId = null;
    this.speechStartTime = null;
    this.lastVoiceDetectedTime = null;
    this.speechVoicedMs = 0;
    this.trailingSilenceBytes = 0;
  }

  discardSpeech() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    if (this.inSpeech) {
      this.emit('speech_end', { utteranceId: this.utteranceId, timestamp: Date.now(), discarded: true });
    }
    this.inSpeech = false;
    this.clearSpeech();
  }

  /**
   * Helper to write a 44-byte standard RIFF WAV header for raw PCM data.
   */
  static createWavBuffer(pcmBuffer, sampleRate = 16000, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmBuffer.length;
    const fileSize = 36 + dataSize;

    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);

    // fmt subchunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size for PCM
    header.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data subchunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  stopCapture() {
    this.discardSpeech();
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.captureProcess) {
      try {
        this.captureProcess.kill('SIGTERM');
      } catch (e) {
        console.error('[SystemAudio] Error stopping parec:', e);
      }
      this.captureProcess = null;
    }

    this.isCapturing = false;
    this.inSpeech = false;
    this.preSpeechChunks = [];
    this.speechStartTime = null;
    this.lastVoiceDetectedTime = null;
    this.speechVoicedMs = 0;
    this.emit('status', { isCapturing: false, sink: this.currentSink });
    console.log('[SystemAudio] PC loopback capture stopped.');
  }

  getStatus() {
    return {
      isCapturing: this.isCapturing,
      sink: this.currentSink,
      vadThreshold: this.vadThreshold,
      silenceMsThreshold: this.silenceMsThreshold,
    };
  }
}

export const systemAudioEngine = new SystemAudioEngine();
