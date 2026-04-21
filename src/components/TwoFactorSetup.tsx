'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { generateTotpSecret, getTotpUri, verifyTotpCode, encryptTotpSecret, decryptTotpSecret } from '@/lib/totp';
import { ShieldCheck, ShieldOff, QrCode, Loader2, X, Check } from 'lucide-react';
import QRCode from 'qrcode';

type TwoFAStatus = 'loading' | 'disabled' | 'setup' | 'enabled';

export default function TwoFactorSetup() {
  const { user, masterKey } = useStore();

  const [status, setStatus] = useState<TwoFAStatus>('disabled');
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableError, setDisableError] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [copied, setCopied] = useState(false);

  const load2FAStatus = useCallback(async () => {
    if (!user || !masterKey) return; // vault locked — stay on current status, don't show spinner
    setStatus('loading');
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, '2fa', 'totp'));
      if (snap.exists() && snap.data()?.enabled === true) {
        setStatus('enabled');
      } else {
        setStatus('disabled');
      }
    } catch {
      setStatus('disabled');
    }
  }, [user, masterKey]);

  useEffect(() => {
    load2FAStatus();
  }, [load2FAStatus]);

  const handleStartSetup = async () => {
    if (!user || !masterKey) return;
    const newSecret = generateTotpSecret();
    setSecret(newSecret);
    setVerifyCode('');
    setVerifyError('');
    const uri = getTotpUri(newSecret, user.email);
    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 2,
        color: { dark: '#f4f4f5', light: '#18181b' },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
    setStatus('setup');
  };

  const handleVerifyAndEnable = async () => {
    if (!user || !masterKey || !secret) return;
    setVerifyLoading(true);
    setVerifyError('');
    const code = verifyCode.replace(/\s/g, '');
    if (code.length !== 6) {
      setVerifyError('Enter the 6-digit code from your authenticator app.');
      setVerifyLoading(false);
      return;
    }
    if (!verifyTotpCode(secret, code, user.email)) {
      setVerifyError('Incorrect code. Make sure your device clock is accurate and try again.');
      setVerifyLoading(false);
      return;
    }
    try {
      const encryptedSecret = encryptTotpSecret(secret, masterKey);
      await setDoc(doc(db, 'users', user.uid, '2fa', 'totp'), {
        encryptedSecret,
        enabled: true,
        updatedAt: serverTimestamp(),
      });
      setStatus('enabled');
      setSecret('');
      setQrDataUrl('');
      setVerifyCode('');
    } catch {
      setVerifyError('Failed to save 2FA settings. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!user || !masterKey) return;
    setDisableLoading(true);
    setDisableError('');
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, '2fa', 'totp'));
      if (!snap.exists()) {
        setDisableError('2FA data not found.');
        return;
      }
      const storedSecret = decryptTotpSecret(snap.data()?.encryptedSecret, masterKey);
      if (!storedSecret) {
        setDisableError('Could not decrypt 2FA secret. Make sure your vault is unlocked.');
        return;
      }
      const code = disableCode.replace(/\s/g, '');
      if (!verifyTotpCode(storedSecret, code, user.email)) {
        setDisableError('Incorrect code. Please try again.');
        return;
      }
      await deleteDoc(doc(db, 'users', user.uid, '2fa', 'totp'));
      setStatus('disabled');
      setShowDisableForm(false);
      setDisableCode('');
    } catch {
      setDisableError('Failed to disable 2FA. Please try again.');
    } finally {
      setDisableLoading(false);
    }
  };

  const handleCancelSetup = () => {
    setStatus('disabled');
    setSecret('');
    setQrDataUrl('');
    setVerifyCode('');
    setVerifyError('');
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isVaultUnlocked = !!masterKey;

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading 2FA status...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {status === 'enabled' ? (
          <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Enabled
          </span>
        ) : (
          <span className="text-xs bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldOff className="w-3 h-3" /> Disabled
          </span>
        )}
      </div>

      {!isVaultUnlocked && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Your vault is locked. Unlock it first to manage 2FA.
        </div>
      )}

      {/* Disabled state */}
      {status === 'disabled' && isVaultUnlocked && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-zinc-400">
            Add an extra layer of security. After enabling, every login will require a 6-digit code from your authenticator app (Google Authenticator, Authy, 1Password, etc.).
          </p>
          <div className="flex-shrink-0">
            <button
              onClick={handleStartSetup}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
            >
              <QrCode className="w-4 h-4" />
              Set Up 2FA
            </button>
          </div>
        </div>
      )}

      {/* Setup flow */}
      {status === 'setup' && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-200 mb-1">Step 1 — Scan this QR code</p>
            <p className="text-xs text-zinc-400">Open your authenticator app and scan the QR code below.</p>
          </div>

          {qrDataUrl ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="TOTP QR Code" className="rounded-xl border border-zinc-700" width={200} height={200} />
            </div>
          ) : null}

          <div>
            <p className="text-xs text-zinc-500 mb-1">Or enter this secret manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-emerald-400 font-mono tracking-widest break-all">
                {secret}
              </code>
              <button
                onClick={handleCopySecret}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex-shrink-0"
                title="Copy secret"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <QrCode className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-200 mb-1">Step 2 — Verify the code</p>
            <p className="text-xs text-zinc-400 mb-2">Enter the 6-digit code shown in your authenticator app to confirm setup.</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={7}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9\s]/g, ''))}
              placeholder="000 000"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest text-center"
            />
          </div>

          {verifyError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
              {verifyError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleVerifyAndEnable}
              disabled={verifyLoading || verifyCode.replace(/\s/g, '').length < 6}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {verifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {verifyLoading ? 'Verifying...' : 'Enable 2FA'}
            </button>
            <button
              onClick={handleCancelSetup}
              disabled={verifyLoading}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Enabled state */}
      {status === 'enabled' && isVaultUnlocked && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-zinc-400">
              2FA is active. Every login requires a code from your authenticator app. If you lose access, you can recover via email OTP on the login screen.
            </p>
            {!showDisableForm && (
              <div className="flex-shrink-0">
                <button
                  onClick={() => { setShowDisableForm(true); setDisableCode(''); setDisableError(''); }}
                  className="bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/50 text-red-400 font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap"
                >
                  <ShieldOff className="w-4 h-4" />
                  Disable 2FA
                </button>
              </div>
            )}
          </div>
          {showDisableForm && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
              <p className="text-sm text-slate-200 font-medium">Confirm with your authenticator code</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={7}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/[^0-9\s]/g, ''))}
                placeholder="000 000"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-red-500 font-mono tracking-widest text-center"
              />
              {disableError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                  {disableError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleDisable}
                  disabled={disableLoading || disableCode.replace(/\s/g, '').length < 6}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {disableLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                  {disableLoading ? 'Disabling...' : 'Confirm Disable'}
                </button>
                <button
                  onClick={() => { setShowDisableForm(false); setDisableCode(''); setDisableError(''); }}
                  disabled={disableLoading}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
