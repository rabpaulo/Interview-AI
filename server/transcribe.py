#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import wave
import speech_recognition as sr

def transcribe_audio(input_file, language="pt-BR"):
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

        text = recognizer.recognize_google(audio_data, language=language)
        return {"text": text}
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
