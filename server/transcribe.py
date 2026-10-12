#!/usr/bin/env python3
import sys
import os
import json
import re
import subprocess
import wave
from concurrent.futures import ThreadPoolExecutor
import speech_recognition as sr

# Frequent function words. Google returns a confident-looking transcript even
# for the wrong language, so the vocabulary is a second signal besides confidence.
STOPWORDS = {
    "pt": {"de", "que", "o", "a", "os", "as", "do", "da", "em", "um", "uma", "para", "com", "não",
           "é", "eu", "você", "isso", "se", "na", "no", "mais", "como", "mas", "por", "ele", "ela",
           "tem", "meu", "minha", "sua", "seu", "está", "foi", "são", "também", "então", "aqui"},
    "en": {"the", "and", "is", "you", "to", "of", "it", "in", "that", "what", "i", "a", "an", "do",
           "this", "are", "was", "for", "with", "have", "how", "can", "your", "my", "we", "be",
           "not", "on", "about", "would", "so", "me", "there", "they", "tell", "why", "will"},
}


def score(language, response):
    alternatives = response.get("alternative") if isinstance(response, dict) else None
    if not alternatives:
        return None
    text = alternatives[0].get("transcript", "").strip()
    if not text:
        return None
    # Confidence is occasionally omitted; treat that as an average result.
    confidence = alternatives[0].get("confidence", 0.6)
    words = re.findall(r"[^\W\d_]+", text.lower())
    vocabulary = STOPWORDS.get(language.split("-")[0].lower(), set())
    ratio = sum(word in vocabulary for word in words) / len(words) if words else 0
    return {"text": text, "language": language, "score": confidence + 0.5 * ratio}


def pick_best(results):
    """Highest score wins; earlier languages (the caller's preference) win ties."""
    best = None
    for result in results:
        if result and (best is None or result["score"] > best["score"]):
            best = result
    return best


def recognize(recognizer, audio_data, languages):
    if len(languages) == 1:
        return {"text": recognizer.recognize_google(audio_data, language=languages[0]), "language": languages[0]}

    def attempt(language):
        try:
            return score(language, recognizer.recognize_google(audio_data, language=language, show_all=True))
        except sr.UnknownValueError:
            return None

    # Same latency as a single request: the languages are recognized concurrently.
    with ThreadPoolExecutor(max_workers=len(languages)) as pool:
        best = pick_best(list(pool.map(attempt, languages)))
    if not best:
        raise sr.UnknownValueError()
    return {"text": best["text"], "language": best["language"]}

def transcribe_audio(input_file, language="pt-BR"):
    # A comma-separated list ("pt-BR,en-US") detects which language was spoken.
    languages = [item.strip() for item in language.split(",") if item.strip()] or ["pt-BR"]
    wav_file = input_file + ".converted.wav"
    try:
        # Streaming packets are already PCM16/16 kHz/mono WAV. Avoid spawning
        # ffmpeg for every three-second packet; retain conversion for WebM etc.
        ready_wav = False
        try:
            with wave.open(input_file, "rb") as source:
                ready_wav = (source.getframerate() == 16000 and
                             source.getnchannels() == 1 and
                             source.getsampwidth() == 2)
        except (wave.Error, EOFError):
            pass
        # Convert any format (webm, ogg, mp4, etc.) to 16kHz mono wav using ffmpeg
        cmd = [
            "ffmpeg", "-y", "-i", input_file,
            "-ar", "16000", "-ac", "1",
            wav_file
        ]
        if ready_wav:
            wav_file = input_file
        else:
            result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            if result.returncode != 0:
                return {"error": "Falha ao converter áudio com ffmpeg"}

        recognizer = sr.Recognizer()
        recognizer.operation_timeout = 15
        with sr.AudioFile(wav_file) as source:
            audio_data = recognizer.record(source)

        return recognize(recognizer, audio_data, languages)
    except sr.UnknownValueError:
        return {"error": "Não foi possível entender o áudio", "code": "unrecognized"}
    except sr.RequestError as e:
        return {"error": f"Erro no serviço de reconhecimento: {str(e)}"}
    except (TimeoutError, subprocess.TimeoutExpired):
        return {"error": "A transcrição demorou demais. Verifique a conexão e tente novamente"}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if wav_file != input_file and os.path.exists(wav_file):
            try:
                os.remove(wav_file)
            except:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Nenhum arquivo de áudio fornecido"}))
        sys.exit(1)

    file_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "pt-BR"

    res = transcribe_audio(file_path, lang)
    print(json.dumps(res, ensure_ascii=False))
