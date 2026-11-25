import { useCallback, useEffect, useRef, useState } from 'react';

function playCompletionBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [0, 0.18].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 1174.66, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.17);
    });
  } catch {
    // Ignore audio context restrictions on iOS when muted
  }
}

export function useRestTimer(options?: { soundEnabled?: boolean; vibrateEnabled?: boolean }) {
  const soundEnabled = options?.soundEnabled ?? true;
  const vibrateEnabled = options?.vibrateEnabled ?? true;
  const [targetEndMs, setTargetEndMs] = useState<number | null>(null);
  const [totalDuration, setTotalDuration] = useState<number>(90);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const completedRef = useRef(false);

  const start = useCallback((seconds: number) => {
    const safeSec = Math.max(5, Math.round(seconds));
    completedRef.current = false;
    setTotalDuration(safeSec);
    setRemainingSeconds(safeSec);
    setTargetEndMs(Date.now() + safeSec * 1000);
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setTargetEndMs((prev) => {
      if (!prev) return null;
      const next = Math.max(Date.now() + 1000, prev + deltaSeconds * 1000);
      const nextRem = Math.max(1, Math.ceil((next - Date.now()) / 1000));
      setRemainingSeconds(nextRem);
      setTotalDuration((t) => Math.max(t, nextRem));
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setTargetEndMs(null);
    setRemainingSeconds(0);
    completedRef.current = false;
  }, []);

  useEffect(() => {
    if (!targetEndMs) return;

    const tick = () => {
      const diffMs = targetEndMs - Date.now();
      if (diffMs <= 0) {
        setRemainingSeconds(0);
        setTargetEndMs(null);
        if (!completedRef.current) {
          completedRef.current = true;
          if (soundEnabled) playCompletionBeep();
          if (vibrateEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([120, 80, 120]);
            } catch {
              // Ignore unsupported vibrate calls
            }
          }
        }
      } else {
        setRemainingSeconds(Math.ceil(diffMs / 1000));
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [targetEndMs, soundEnabled, vibrateEnabled]);

  return {
    isRunning: targetEndMs !== null && remainingSeconds > 0,
    remainingSeconds,
    totalDuration,
    start,
    adjust,
    stop,
  };
}
