"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "@/data/mock/mock-messaging";

/*
 * Voice recording (MS-05): MediaRecorder behind a real feature check — no
 * audio library. The format is whatever the browser actually records
 * (recorder.mimeType, from the first supported candidate); the blob keeps that
 * type and is never renamed to look compatible. Hard stop at 2:00 or 10 MB
 * (owner rule); the server verifies MIME, size and duration again.
 */

const CANDIDATES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

export type VoiceSupport = "supported" | "unsupported";

export function voiceSupport(): VoiceSupport {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") return "unsupported";
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  return "supported";
}

/** The first candidate the browser says it can record, or "" to let it choose. */
export function pickMimeType(): string {
  const isSupported = typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported.bind(MediaRecorder) : () => false;
  return CANDIDATES.find((type) => isSupported(type)) ?? "";
}

export interface VoiceClip {
  blob: Blob;
  url: string;
  /** The type the recorder produced (recorder.mimeType / blob.type). */
  mime: string;
  durationSec: number;
  bytes: number;
  extension: string;
}

export type RecorderState =
  | { kind: "idle" }
  | { kind: "recording"; elapsed: number; bytes: number }
  | { kind: "preview"; clip: VoiceClip; stoppedBy: "user" | "time" | "size" }
  | { kind: "error"; reason: "unsupported" | "denied" | "failed" };

const extensionFor = (mime: string) => (mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : mime.includes("webm") ? "webm" : "audio");

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const bytes = useRef(0);
  const stoppedBy = useRef<"user" | "time" | "size">("user");

  const cleanup = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback((reason: "user" | "time" | "size" = "user") => {
    stoppedBy.current = reason;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (voiceSupport() === "unsupported") {
      setState({ kind: "error", reason: "unsupported" });
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ kind: "error", reason: "denied" });
      return;
    }
    try {
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      stream.current = media;
      recorder.current = rec;
      chunks.current = [];
      bytes.current = 0;
      stoppedBy.current = "user";
      rec.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.current.push(event.data);
        bytes.current += event.data.size;
        if (bytes.current >= VOICE_MAX_BYTES) stop("size");
      };
      rec.onstop = () => {
        cleanup();
        const durationSec = Math.min(VOICE_MAX_SECONDS, (performance.now() - startedAt.current) / 1000);
        const type = rec.mimeType || chunks.current[0]?.type || "";
        const blob = new Blob(chunks.current, type ? { type } : undefined);
        if (!blob.size) {
          setState({ kind: "error", reason: "failed" });
          return;
        }
        setState({
          kind: "preview",
          stoppedBy: stoppedBy.current,
          clip: { blob, url: URL.createObjectURL(blob), mime: blob.type, durationSec: Math.round(durationSec), bytes: blob.size, extension: extensionFor(blob.type) },
        });
      };
      startedAt.current = performance.now();
      rec.start(250);
      setState({ kind: "recording", elapsed: 0, bytes: 0 });
      timer.current = window.setInterval(() => {
        const elapsed = (performance.now() - startedAt.current) / 1000;
        if (elapsed >= VOICE_MAX_SECONDS) stop("time");
        setState((current) => (current.kind === "recording" ? { kind: "recording", elapsed: Math.min(elapsed, VOICE_MAX_SECONDS), bytes: bytes.current } : current));
      }, 250);
    } catch {
      media.getTracks().forEach((track) => track.stop());
      setState({ kind: "error", reason: "failed" });
    }
  }, [cleanup, stop]);

  const discard = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    cleanup();
    setState((current) => {
      if (current.kind === "preview") URL.revokeObjectURL(current.clip.url);
      return { kind: "idle" };
    });
  }, [cleanup]);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, start, stop: () => stop("user"), discard, reset };
}
