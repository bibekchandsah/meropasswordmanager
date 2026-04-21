/**
 * TOTP (Time-based One-Time Password) helpers — RFC 6238 / Google Authenticator compatible.
 *
 * The TOTP secret is generated client-side and stored AES-encrypted in Firestore
 * (encrypted with the user's master key) so the server never sees the plaintext secret.
 * This preserves the zero-knowledge design.
 *
 * Firestore layout:
 *   users/{uid}/2fa/totp  →  { encryptedSecret: string, enabled: boolean, updatedAt: Timestamp }
 *   users/{uid}/2fa/emailOtp  →  { hash: string, expiresAt: number }  (server-side only)
 */

import * as OTPAuth from 'otpauth';
import { encryptData, decryptData } from '@/lib/crypto';

// ─── Secret generation ───────────────────────────────────────────────────────

/** Generate a new random TOTP secret (Base32, 20 bytes = 160 bits). */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

// ─── TOTP instance factory ───────────────────────────────────────────────────

function makeTOTP(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'Mero Passwords',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

// ─── OTP URI for QR code ─────────────────────────────────────────────────────

/** Returns the otpauth:// URI to encode in a QR code. */
export function getTotpUri(secret: string, email: string): string {
  return makeTOTP(secret, email).toString();
}

// ─── Verification ────────────────────────────────────────────────────────────

/**
 * Verify a 6-digit TOTP code.
 * Allows ±1 window (30s before/after) to account for clock drift.
 * Returns true if valid.
 */
export function verifyTotpCode(secret: string, code: string, email: string): boolean {
  const totp = makeTOTP(secret, email);
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
  return delta !== null;
}

// ─── Encrypt / decrypt secret for Firestore storage ─────────────────────────

/** Encrypt the TOTP secret with the user's master key before storing in Firestore. */
export function encryptTotpSecret(secret: string, masterKey: string): string {
  return encryptData(JSON.stringify({ secret, v: 1 }), masterKey);
}

/**
 * Decrypt the TOTP secret from Firestore.
 * Returns null if decryption fails (wrong master key or corrupt data).
 */
export function decryptTotpSecret(encryptedSecret: string, masterKey: string): string | null {
  const json = decryptData(encryptedSecret, masterKey);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.v === 1 && typeof parsed?.secret === 'string') return parsed.secret;
    return null;
  } catch {
    return null;
  }
}
