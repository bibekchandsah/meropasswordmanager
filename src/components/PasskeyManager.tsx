'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
  isPasskeySupported,
  isPasskeyRegistered,
  registerPasskey,
  removePasskey,
} from '@/lib/passkey';
import { Fingerprint, Loader2, Trash2, Mail, RefreshCcw, ShieldCheck, ShieldOff } from 'lucide-react';

export default function PasskeyManager() {
  const { user, masterPassword, masterKey } = useStore();

  const [supported, setSupported] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  // Email recovery state
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const refreshState = useCallback(() => {
    if (!user) return;
    setSupported(isPasskeySupported());
    setRegistered(isPasskeyRegistered(user.uid));
  }, [user]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const handleRegister = async () => {
    if (!user) return;

    if (!masterPassword) {
      setRegisterError(
        'Your master password is not in memory. Please lock and unlock your vault first, then try again.'
      );
      return;
    }

    setRegisterLoading(true);
    setRegisterError(null);
    setRegisterSuccess(null);

    try {
      await registerPasskey(user.uid, user.email, masterPassword);
      setRegistered(true);
      setRegisterSuccess('Passkey registered! You can now sign in with your device biometrics.');
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('not allowed')) {
        setRegisterError('Passkey registration was cancelled or denied.');
      } else {
        setRegisterError(msg || 'Failed to register passkey. Please try again.');
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleRemove = () => {
    if (!user) return;
    if (!confirm('Remove passkey from this device? You will need your master password to sign in.')) return;
    removePasskey(user.uid);
    setRegistered(false);
    setRegisterSuccess(null);
    setRegisterError(null);
  };

  const handleSendEmail = async () => {
    if (!user || !masterPassword) {
      setEmailError(
        'Your master password is not in memory. Lock and unlock your vault first, then try again.'
      );
      return;
    }

    setEmailLoading(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const res = await fetch('/api/send-master-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, masterPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || 'Failed to send email.');
      } else {
        setEmailSuccess(`Master password sent to ${user.email}. Check your inbox (and spam folder).`);
      }
    } catch {
      setEmailError('Network error. Please try again.');
    } finally {
      setEmailLoading(false);
    }
  };

  if (!supported) {
    return (
      <div className="p-4 bg-zinc-500/5 border border-zinc-500/20 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <ShieldOff className="w-5 h-5 text-zinc-500" />
          <h3 className="font-semibold text-zinc-400">Passkey</h3>
        </div>
        <p className="text-sm text-zinc-500">
          Your browser or device does not support passkeys (WebAuthn). Try Chrome, Safari, or Edge on a device with biometrics.
        </p>
      </div>
    );
  }

  const isVaultUnlocked = !!masterKey && !!masterPassword;

  return (
    <div className="space-y-4">
      {/* Passkey registration / removal */}
      <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Fingerprint className="w-5 h-5 text-violet-400" />
              <h3 className="font-semibold text-slate-200">Passkey (Biometric Login)</h3>
              {registered ? (
                <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Enabled
                </span>
              ) : (
                <span className="text-xs bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 px-2 py-0.5 rounded-full">
                  Not set up
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 max-w-xl">
              {registered
                ? 'Passkey is active on this device. Sign in with Face ID, fingerprint, or Windows Hello — no master password needed.'
                : 'Register your device biometrics (Face ID, fingerprint, Windows Hello) to sign in without typing your master password.'}
            </p>
          </div>
        </div>

        {!isVaultUnlocked && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Your vault is locked. Unlock it first before managing passkeys.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!registered ? (
            <button
              onClick={handleRegister}
              disabled={registerLoading || !isVaultUnlocked}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {registerLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Fingerprint className="w-4 h-4" />
              )}
              {registerLoading ? 'Registering...' : 'Set Up Passkey'}
            </button>
          ) : (
            <button
              onClick={handleRemove}
              className="bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/50 text-red-400 font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              Remove Passkey
            </button>
          )}
        </div>

        {registerError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
            {registerError}
          </div>
        )}
        {registerSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
            {registerSuccess}
          </div>
        )}
      </div>

      {/* Email recovery */}
      <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-xl space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-5 h-5 text-sky-400" />
            <h3 className="font-semibold text-slate-200">Email Master Password</h3>
          </div>
          <p className="text-sm text-zinc-400 max-w-xl">
            Send your current master password to <strong className="text-zinc-300">{user?.email}</strong> as a backup. Delete the email after saving it somewhere safe.
          </p>
        </div>

        {!isVaultUnlocked && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Your vault is locked. Unlock it first to use this feature.
          </div>
        )}

        <button
          onClick={handleSendEmail}
          disabled={emailLoading || !isVaultUnlocked}
          className="bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {emailLoading ? (
            <RefreshCcw className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          {emailLoading ? 'Sending...' : 'Send to My Email'}
        </button>

        {emailError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
            {emailError}
          </div>
        )}
        {emailSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
            {emailSuccess}
          </div>
        )}
      </div>
    </div>
  );
}
