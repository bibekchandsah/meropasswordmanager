'use client';

import { useState } from 'react';
import { Shield, Loader2, Mail, RefreshCcw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TwoFactorChallengeProps {
  email: string;
  accountPassword: string; // needed for email OTP recovery API calls
  onVerified: () => void;  // called when TOTP or email OTP is confirmed
  onCancel: () => void;
  verifyTotp: (code: string) => Promise<boolean>; // caller provides this
}

type Mode = 'totp' | 'email-otp';

export default function TwoFactorChallenge({
  email,
  accountPassword,
  onVerified,
  onCancel,
  verifyTotp,
}: TwoFactorChallengeProps) {
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [totpWasReset, setTotpWasReset] = useState(false);

  const handleVerify = async () => {
    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'totp') {
        const ok = await verifyTotp(trimmed);
        if (!ok) {
          setError('Incorrect code. Check your authenticator app and try again.');
          return;
        }
        onVerified();
      } else {
        // Verify email OTP via API
        const res = await fetch('/api/2fa/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, accountPassword, otp: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Incorrect OTP. Please try again.');
          return;
        }
        // If the server reset the TOTP, show a brief notice before proceeding
        if (data.totpReset) {
          setTotpWasReset(true);
          await new Promise(r => setTimeout(r, 2200));
        }
        onVerified();
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    setSendingOtp(true);
    setError('');
    try {
      const res = await fetch('/api/2fa/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accountPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send OTP. Please try again.');
        return;
      }
      setOtpSent(true);
      setMode('email-otp');
      setCode('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleVerify();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">Two-Factor Authentication</h2>
                <p className="text-xs text-zinc-500">
                  {mode === 'totp' ? 'Enter the code from your authenticator app' : 'Enter the code sent to your email'}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 bg-zinc-950 rounded-xl p-1 mb-4">
            <button
              onClick={() => { setMode('totp'); setCode(''); setError(''); }}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors cursor-pointer ${mode === 'totp' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Authenticator App
            </button>
            <button
              onClick={() => { setMode('email-otp'); setCode(''); setError(''); }}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors cursor-pointer ${mode === 'email-otp' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Email Recovery
            </button>
          </div>

          {/* Code input */}
          <div className="space-y-3">
            {mode === 'email-otp' && !otpSent && (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-300">
                Click &quot;Send Code&quot; to receive a recovery OTP at <strong>{email}</strong>.
              </div>
            )}
            {mode === 'email-otp' && otpSent && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                Code sent to <strong>{email}</strong>. Valid for 10 minutes.
              </div>
            )}

            {totpWasReset && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                ✓ Identity verified. Your old authenticator has been unlinked — please set up a new one in Settings after signing in.
              </div>
            )}

            <input
              type="text"
              inputMode="numeric"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9\s]/g, ''))}
              onKeyDown={handleKeyDown}
              placeholder="000 000"
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-lg text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-[0.3em] text-center"
            />

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            {mode === 'totp' ? (
              <button
                onClick={handleVerify}
                disabled={loading || code.replace(/\s/g, '').length < 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSendEmailOtp}
                  disabled={sendingOtp}
                  className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2.5 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {sendingOtp ? 'Sending...' : otpSent ? 'Resend Code' : 'Send Code'}
                </button>
                {otpSent && (
                  <button
                    onClick={handleVerify}
                    disabled={loading || code.replace(/\s/g, '').length < 6}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    {loading ? 'Verifying...' : 'Verify'}
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-xs text-zinc-600 mt-4">
            Lost access to your authenticator? Switch to &quot;Email Recovery&quot; above.
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
