"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Voice capture on the browser's Web Speech API (SpeechRecognition, or the
 * webkit-prefixed one), feature-detected on start. Only text is kept: there
 * is no audio library (P18 · G). States: idle → recording ⇄ paused →
 * processing → done, or error (unsupported, denied, no-speech, network,
 * failed). Recognition stops by itself after a silence; while recording it
 * is restarted so one note can span pauses in speech.
 */

export type SpeechStatus = "idle" | "recording" | "paused" | "processing" | "done" | "error";
export type SpeechError = "unsupported" | "denied" | "no-speech" | "network" | "failed";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function mapError(code: string): SpeechError {
  if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") return "denied";
  if (code === "no-speech") return "no-speech";
  if (code === "network") return "network";
  return "failed";
}

const join = (...parts: string[]) => parts.map((part) => part.trim()).filter(Boolean).join(" ");

export interface SpeechCapture {
  status: SpeechStatus;
  error: SpeechError | null;
  /** Final words so far. */
  transcript: string;
  /** Words still being recognised (recording only). */
  interim: string;
  /** Whole seconds recorded (paused time excluded). */
  seconds: number;
  start(): void;
  pause(): void;
  resume(): void;
  finish(): void;
  /** Stops without keeping anything. */
  cancel(): void;
}

export function useSpeechCapture(lang: string): SpeechCapture {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<SpeechError | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const recognition = useRef<Recognition | null>(null);
  const finalText = useRef("");
  /** What the next `end` event means. */
  const intent = useRef<"record" | "pause" | "finish" | "cancel">("record");
  const failed = useRef(false);

  const listen = useCallback(() => {
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      setError("unsupported");
      setStatus("error");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    failed.current = false;
    intent.current = "record";
    rec.onresult = (event) => {
      if (recognition.current !== rec) return;
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) finalText.current = join(finalText.current, result[0].transcript);
        else pending = join(pending, result[0].transcript);
      }
      setTranscript(finalText.current);
      setInterim(pending);
    };
    rec.onerror = (event) => {
      if (recognition.current !== rec || event.error === "aborted") return;
      // A silence while something was already heard is not a failure.
      if (event.error === "no-speech" && finalText.current) return;
      failed.current = true;
      setError(mapError(event.error));
      setStatus("error");
    };
    rec.onend = () => {
      // A replaced session (resumed before the old one ended) is ignored.
      if (recognition.current !== rec) return;
      setInterim("");
      if (failed.current || intent.current === "cancel") return;
      if (intent.current === "record") {
        // Ended on its own after a silence: keep listening.
        try {
          rec.start();
        } catch {
          setError("failed");
          setStatus("error");
        }
        return;
      }
      if (intent.current === "pause") {
        setStatus("paused");
        return;
      }
      if (finalText.current) {
        setStatus("done");
      } else {
        setError("no-speech");
        setStatus("error");
      }
    };
    recognition.current = rec;
    try {
      rec.start();
      setError(null);
      setStatus("recording");
    } catch {
      setError("failed");
      setStatus("error");
    }
  }, [lang]);

  // The timer runs only while recording.
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  // Closing the panel mid-recording releases the microphone.
  useEffect(
    () => () => {
      intent.current = "cancel";
      recognition.current?.abort();
    },
    [],
  );

  const start = useCallback(() => {
    finalText.current = "";
    setTranscript("");
    setInterim("");
    setSeconds(0);
    listen();
  }, [listen]);

  const pause = useCallback(() => {
    intent.current = "pause";
    setStatus("paused");
    recognition.current?.stop();
  }, []);

  const finish = useCallback(() => {
    if (status === "paused") {
      if (finalText.current) setStatus("done");
      else {
        setError("no-speech");
        setStatus("error");
      }
      return;
    }
    intent.current = "finish";
    setStatus("processing");
    recognition.current?.stop();
  }, [status]);

  const cancel = useCallback(() => {
    intent.current = "cancel";
    recognition.current?.abort();
  }, []);

  return { status, error, transcript, interim, seconds, start, pause, resume: listen, finish, cancel };
}
