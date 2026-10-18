import { useEffect, useRef, useState } from 'react';
import { recorderErrorMessage } from '../services/recorderErrors';

const MAX_DURATION_MS = 5 * 60 * 1000;

export function preferredAudioMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? null;
}

export function useVoiceRecorder() {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const previewRef = useRef<string | null>(null);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function clearPreview() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
  }

  useEffect(() => {
    return () => {
      releaseStream();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não grava áudio.');
      return;
    }
    const mimeType = preferredAudioMime();
    if (!mimeType) {
      setError('Este navegador não grava áudio num formato compatível.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        releaseStream();
        clearPreview();
        const url = URL.createObjectURL(recorded);
        previewRef.current = url;
        setBlob(recorded);
        setMime(recorder.mimeType || mimeType);
        setPreviewUrl(url);
        setPhase('preview');
      };
      recorderRef.current = recorder;
      recorder.start();
      startedRef.current = Date.now();
      setElapsedMs(0);
      setPhase('recording');
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DURATION_MS && recorder.state === 'recording') recorder.stop();
      }, 200);
    } catch (caught) {
      releaseStream();
      setPhase('idle');
      setError(recorderErrorMessage(caught));
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => releaseStream();
      recorder.stop();
    } else {
      releaseStream();
    }
    clearPreview();
    setBlob(null);
    setMime(null);
    setElapsedMs(0);
    setPhase('idle');
    setError(null);
  }

  return { phase, elapsedMs, error, previewUrl, blob, mime, start, stop, cancel };
}
