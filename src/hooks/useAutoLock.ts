import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';

const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes

// Activity events that reset the inactivity timer
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
  'focus',
];

/**
 * Automatically locks the vault (clears masterKey + masterPassword from memory)
 * after INACTIVITY_MS of no user activity.
 *
 * Only active when the vault is currently unlocked (masterKey is set).
 * Does NOT sign the user out — they stay authenticated with Firebase,
 * they just need to re-enter their master password to unlock the vault again.
 */
export function useAutoLock() {
  const { masterKey, setMasterKey, setMasterPassword } = useStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether vault is unlocked without causing re-renders on every activity
  const isUnlockedRef = useRef(!!masterKey);

  useEffect(() => {
    isUnlockedRef.current = !!masterKey;
  }, [masterKey]);

  const lockVault = useCallback(() => {
    setMasterKey(null);
    setMasterPassword(null);
  }, [setMasterKey, setMasterPassword]);

  const resetTimer = useCallback(() => {
    if (!isUnlockedRef.current) return; // vault already locked, nothing to do
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lockVault, INACTIVITY_MS);
  }, [lockVault]);

  useEffect(() => {
    if (!masterKey) {
      // Vault is locked — clear any pending timer and stop listening
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Vault just unlocked — start the timer and attach listeners
    resetTimer();

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [masterKey, resetTimer]);
}
