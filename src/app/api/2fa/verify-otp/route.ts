import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

/**
 * POST /api/2fa/verify-otp
 *
 * Verifies the email OTP for 2FA recovery.
 * Reads the stored hash from Firestore, compares, checks expiry, then deletes it.
 *
 * Body: { email: string; accountPassword: string; otp: string }
 * Returns: { success: true } or { error: string }
 */

function hashOtp(otp: string): string {
  return CryptoJS.SHA256(otp).toString(CryptoJS.enc.Hex);
}

async function firebaseSignIn(apiKey: string, email: string, password: string) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error('INVALID_CREDENTIALS');
  const data = await res.json();
  return { uid: data.localId as string, idToken: data.idToken as string };
}

async function firestoreGet(projectId: string, idToken: string, path: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('FIRESTORE_ERROR');
  const data = await res.json();
  return data?.fields ?? null;
}

async function firestoreDelete(projectId: string, idToken: string, path: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } });
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) return NextResponse.json({ error: 'Server configuration error.' }, { status: 503 });

  let body: { email?: string; accountPassword?: string; otp?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body.' }, { status: 400 }); }

  const { email, accountPassword, otp } = body;
  if (!email || !accountPassword || !otp) {
    return NextResponse.json({ error: 'Email, account password, and OTP are required.' }, { status: 400 });
  }

  let uid: string, idToken: string;
  try {
    ({ uid, idToken } = await firebaseSignIn(apiKey, email, accountPassword));
  } catch {
    return NextResponse.json({ error: 'Incorrect email or account password.' }, { status: 401 });
  }

  let fields: Record<string, { stringValue?: string; integerValue?: string }> | null;
  try {
    fields = await firestoreGet(projectId, idToken, `users/${uid}/2fa/emailOtp`);
  } catch {
    return NextResponse.json({ error: 'Could not read OTP data.' }, { status: 502 });
  }

  if (!fields) {
    return NextResponse.json({ error: 'No OTP found. Please request a new one.' }, { status: 404 });
  }

  const storedHash = fields.hash?.stringValue ?? '';
  const expiresAt = parseInt(fields.expiresAt?.integerValue ?? '0', 10);

  if (Date.now() > expiresAt) {
    await firestoreDelete(projectId, idToken, `users/${uid}/2fa/emailOtp`).catch(() => {});
    return NextResponse.json({ error: 'OTP has expired. Please request a new one.' }, { status: 410 });
  }

  const inputHash = hashOtp(otp.replace(/\s/g, ''));
  if (inputHash !== storedHash) {
    return NextResponse.json({ error: 'Incorrect OTP. Please try again.' }, { status: 401 });
  }

  // Valid — delete the one-time OTP so it can't be reused
  await firestoreDelete(projectId, idToken, `users/${uid}/2fa/emailOtp`).catch(() => {});

  // Also delete the TOTP record so the old authenticator is invalidated.
  // The user will be prompted to set up a new authenticator on their next login.
  await firestoreDelete(projectId, idToken, `users/${uid}/2fa/totp`).catch(() => {});

  return NextResponse.json({ success: true, totpReset: true });
}
