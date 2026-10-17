import WebSocket from 'ws';
import { AUTO_LANGUAGE, LANGUAGES } from '../shared/language.js';

// Streaming recognition of the PC audio with Deepgram Nova-3. Interim results
// arrive a few hundred milliseconds after each word, so the live transcript grows
// word by word instead of once per 3 s window. The engine's VAD still decides
// where an utterance ends; Finalize then flushes whatever Deepgram still holds.
//
// Each utterance gets its own connection, so its results never mix with the next
// one's. A spare connection is opened ahead of time and kept alive, because the
// TLS and WebSocket handshake would otherwise delay the first words.
export const LISTEN_URL = 'wss://api.deepgram.com/v1/listen';
const PROJECTS_URL = 'https://api.deepgram.com/v1/projects';
const BYTES_PER_SECOND = 32000; // PCM16 mono at 16 kHz
const BASE_LANGUAGE = { pt: 'pt-BR', en: 'en-US' };

export function listenUrl(language, { model = 'nova-3', base = LISTEN_URL } = {}) {
  const params = new URLSearchParams({
    model, language, encoding: 'linear16', sample_rate: '16000', channels: '1',
    interim_results: 'true', punctuate: 'true', smart_format: 'true',
    // Deepgram recommends a short endpoint for code-switching ("multi").
    endpointing: language === 'multi' ? '100' : '300',
  });
  return `${base}?${params}`;
}

/** Auto mode recognizes pt-BR and en-US together; a fixed language is sent as is. */
export function requestLanguage(setting) {
  return setting && setting !== AUTO_LANGUAGE ? setting : 'multi';
}

/** The language most words were in, among the app's languages; ties go to `preferred`. */
export function detectLanguage(counts, preferred) {
  const ranked = LANGUAGES.filter((language) => counts[language])
    .sort((a, b) => counts[b] - counts[a] || (b === preferred) - (a === preferred));
  return ranked[0] || (LANGUAGES.includes(preferred) ? preferred : null);
}

function defaultConnect(url, key) {
  return new WebSocket(url, { headers: { Authorization: `Token ${key}` } });
}

export function createDeepgramTranscriber({
  getKey,
  connect = defaultConnect,
  fetchImpl = (...args) => fetch(...args),
  url = LISTEN_URL,
  model = 'nova-3',
  keepAliveMs = 4000,
  connectTimeoutMs = 5000,
  finalizeTimeoutMs = 1500,
  cooldownMs = 30000,
  maxQueuedBytes = 5 * BYTES_PER_SECOND,
  now = Date.now,
} = {}) {
  let spare = null;
  let downUntil = 0;
  let state = { status: getKey() ? 'checking' : null, reason: null };

  function markFailure(reason, { auth = false } = {}) {
    // A rejected key stays off until it changes; anything else is retried later.
    downUntil = auth ? Infinity : now() + cooldownMs;
    state = { status: auth ? 'unavailable' : 'unverified', reason };
    closeSpare();
    console.warn(`[Deepgram] ${reason} Usando o reconhecimento padrão${auth ? '' : ` por ${cooldownMs / 1000} s`}.`);
  }

  function openConnection(language) {
    const conn = { language, open: false, closed: false, ending: false, listener: null, lastSent: now() };
    let settleReady;
    conn.ready = new Promise((resolve) => { settleReady = resolve; });
    const fail = (reason, options) => {
      if (conn.closed) return;
      const opened = conn.open;
      conn.closed = true;
      clearInterval(conn.keepAlive);
      clearTimeout(conn.connectTimer);
      try { conn.socket.terminate(); } catch {}
      // We closed it ourselves (a cancelled utterance): nothing failed.
      if (conn.ending) {
        settleReady(false);
        conn.listener?.closed();
        return;
      }
      // Only a failure to connect says the service is unusable; a dropped stream
      // affects that utterance alone.
      if (!opened) markFailure(reason, options);
      settleReady(false);
      if (spare === conn) spare = null;
      conn.listener?.failed(reason);
    };
    try {
      conn.socket = connect(listenUrl(language, { model, base: url }), getKey());
    } catch (error) {
      conn.socket = { terminate() {} };
      queueMicrotask(() => fail(`Não foi possível conectar à Deepgram: ${error.message}.`));
      return conn;
    }
    conn.connectTimer = setTimeout(() => fail('A Deepgram não respondeu a tempo.'), connectTimeoutMs);
    conn.socket.on('open', () => {
      clearTimeout(conn.connectTimer);
      conn.open = true;
      downUntil = 0;
      if (state.status !== 'available') state = { status: 'available', reason: null };
      settleReady(true);
    });
    conn.socket.on('unexpected-response', (_request, response) => {
      const status = response?.statusCode;
      const auth = status === 401 || status === 403;
      fail(auth ? 'A Deepgram recusou a API key.' : `A Deepgram respondeu com HTTP ${status}.`, { auth });
    });
    conn.socket.on('error', (error) => fail(`Erro na conexão com a Deepgram: ${error.message}.`));
    conn.socket.on('close', (code) => {
      if (conn.ending) {
        conn.closed = true;
        clearInterval(conn.keepAlive);
        conn.listener?.closed();
      } else fail(`A conexão com a Deepgram foi encerrada (${code}).`);
    });
    conn.socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      conn.listener?.message(message);
    });
    // Deepgram closes a connection after 10 s without audio or KeepAlive.
    conn.keepAlive = setInterval(() => {
      if (conn.open && !conn.closed && now() - conn.lastSent >= keepAliveMs) sendText(conn, { type: 'KeepAlive' });
    }, keepAliveMs);
    conn.keepAlive.unref?.();
    return conn;
  }

  function sendText(conn, payload) {
    if (!conn.open || conn.closed) return;
    try { conn.socket.send(JSON.stringify(payload)); } catch {}
  }

  function closeSpare() {
    const conn = spare;
    spare = null;
    if (!conn || conn.closed) return;
    conn.ending = true;
    clearInterval(conn.keepAlive);
    clearTimeout(conn.connectTimer);
    if (conn.open) sendText(conn, { type: 'CloseStream' });
    try { conn.open ? conn.socket.close() : conn.socket.terminate(); } catch {}
    conn.closed = true;
  }

  function available() {
    return Boolean(getKey()) && now() >= downUntil;
  }

  function warm(setting) {
    if (!available()) return;
    const language = requestLanguage(setting);
    if (spare && !spare.closed && spare.language === language) return;
    closeSpare();
    spare = openConnection(language);
  }

  function take(setting) {
    const language = requestLanguage(setting);
    let conn = spare;
    spare = null;
    if (!conn || conn.closed || conn.language !== language) {
      if (conn && !conn.closed) { spare = conn; closeSpare(); }
      conn = openConnection(language);
    }
    // The next utterance must not wait for a handshake either.
    queueMicrotask(() => warm(setting));
    return conn;
  }

  /**
   * One utterance. `onPartial(text, { settled })` fires as the transcript grows;
   * `settled` marks a pause Deepgram detected. `finish()` resolves `{ text, language }`
   * or `{ error }`; it never rejects.
   */
  function start({ language: setting, preferred = null, onPartial = () => {}, onError = () => {} }) {
    const fixed = setting && setting !== AUTO_LANGUAGE ? setting : null;
    const conn = take(setting);
    const committed = [];
    const counts = {};
    let interim = '';
    let lastText = '';
    let queue = [];
    let queuedBytes = 0;
    let failure = null;
    let finishing = false;
    let cancelled = false;
    let onFinalized = null;

    const text = () => [...committed, interim].filter(Boolean).join(' ');
    const fail = (reason) => {
      if (failure || cancelled) return;
      failure = reason;
      queue = [];
      onFinalized?.();
      onError(reason);
    };

    conn.listener = {
      failed: fail,
      closed: () => onFinalized?.(),
      message(message) {
        if (message.type !== 'Results' || cancelled) return;
        const alternative = message.channel?.alternatives?.[0];
        const transcript = alternative?.transcript?.trim() || '';
        if (message.is_final) {
          if (transcript) committed.push(transcript);
          interim = '';
          for (const word of alternative?.words || []) {
            const language = BASE_LANGUAGE[String(word.language || '').split('-')[0]];
            if (language) counts[language] = (counts[language] || 0) + 1;
          }
        } else interim = transcript;
        if (message.from_finalize) onFinalized?.();
        const current = text();
        if (!finishing && current && current !== lastText) {
          lastText = current;
          onPartial(current, { settled: Boolean(message.speech_final) });
        }
      },
    };

    conn.ready.then((opened) => {
      if (!opened || cancelled) return;
      for (const pcm of queue) send(pcm);
      queue = [];
      queuedBytes = 0;
    });

    function send(pcm) {
      try {
        conn.socket.send(pcm);
        conn.lastSent = now();
      } catch (error) { fail(`Falha ao enviar áudio à Deepgram: ${error.message}.`); }
    }

    function end() {
      conn.ending = true;
      sendText(conn, { type: 'CloseStream' });
      // Deepgram closes after CloseStream; never leave the socket behind.
      setTimeout(() => { try { conn.socket.terminate(); } catch {} }, 2000).unref?.();
    }

    return {
      write(pcm) {
        if (failure || cancelled || finishing || !pcm?.length) return;
        if (conn.open) return send(pcm);
        queuedBytes += pcm.length;
        if (queuedBytes > maxQueuedBytes) return fail('A conexão com a Deepgram demorou demais.');
        queue.push(pcm);
      },
      async finish() {
        finishing = true;
        if (!failure && !conn.open) {
          await conn.ready;
          if (cancelled) return { cancelled: true };
        }
        if (failure) return { error: failure };
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, finalizeTimeoutMs);
          onFinalized = () => { clearTimeout(timer); resolve(); };
          sendText(conn, { type: 'Finalize' });
        });
        onFinalized = null;
        end();
        if (cancelled) return { cancelled: true };
        if (failure && !text()) return { error: failure };
        return { text: text(), language: fixed || detectLanguage(counts, preferred) };
      },
      cancel() {
        if (cancelled) return;
        cancelled = true;
        onFinalized?.();
        if (conn.open) end();
        else {
          conn.ending = true;
          try { conn.socket.terminate(); } catch {}
        }
      },
    };
  }

  /** Checks the key once, so the keys screen can say whether it works. */
  async function verify() {
    const key = getKey();
    if (!key) {
      state = { status: null, reason: null };
      return state;
    }
    try {
      const response = await fetchImpl(PROJECTS_URL, {
        headers: { Authorization: `Token ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        downUntil = 0;
        state = { status: 'available', reason: null };
      } else if (response.status === 401) markFailure('A Deepgram recusou a API key.', { auth: true });
      else state = { status: 'unverified', reason: `A Deepgram respondeu com HTTP ${response.status}; a key será testada na próxima fala.` };
    } catch (error) {
      state = { status: 'unverified', reason: `Não foi possível verificar a key: ${error.message}` };
    }
    return state;
  }

  return {
    available,
    start,
    warm,
    verify,
    status: () => ({ ...state }),
    /** A new or removed key: forget past failures and the connection opened with the old one. */
    reset() {
      closeSpare();
      downUntil = 0;
      state = { status: getKey() ? 'checking' : null, reason: null };
    },
    close: closeSpare,
  };
}
