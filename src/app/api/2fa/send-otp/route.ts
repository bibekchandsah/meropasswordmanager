import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

/**
 * POST /api/2fa/send-otp
 *
 * Generates a 6-digit OTP, stores a SHA-256 hash + expiry in Firestore
 * (via REST API using the user's idToken), and emails the code via Resend.
 *
 * Body: { email: string; accountPassword: string }
 *
 * Flow:
 * 1. Verify credentials → get uid + idToken
 * 2. Generate 6-digit OTP
 * 3. Store hash(OTP) + expiresAt in Firestore users/{uid}/2fa/emailOtp
 * 4. Send OTP to email
 */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, '0');
}

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
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const code: string = err?.error?.message ?? '';
    if (code.startsWith('INVALID_LOGIN_CREDENTIALS') || code === 'INVALID_PASSWORD' || code === 'EMAIL_NOT_FOUND') {
      throw new Error('INVALID_CREDENTIALS');
    }
    throw new Error('AUTH_ERROR');
  }
  const data = await res.json();
  return { uid: data.localId as string, idToken: data.idToken as string };
}

async function firestoreSet(projectId: string, idToken: string, path: string, fields: Record<string, unknown>) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;

  // Build Firestore REST field map
  const firestoreFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') firestoreFields[k] = { stringValue: v };
    else if (typeof v === 'number') firestoreFields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') firestoreFields[k] = { booleanValue: v };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: firestoreFields }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Firestore set error:', res.status, body);
    throw new Error('FIRESTORE_ERROR');
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const resendApiKey = process.env.RESEND_EMAIL_API_KEY;

  if (!apiKey || !projectId) return NextResponse.json({ error: 'Server configuration error.' }, { status: 503 });
  if (!resendApiKey) return NextResponse.json({ error: 'Email service not configured.' }, { status: 503 });

  let body: { email?: string; accountPassword?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body.' }, { status: 400 }); }

  const { email, accountPassword } = body;
  if (!email || !accountPassword) return NextResponse.json({ error: 'Email and account password required.' }, { status: 400 });

  let uid: string, idToken: string;
  try {
    ({ uid, idToken } = await firebaseSignIn(apiKey, email, accountPassword));
  } catch (err: unknown) {
    if ((err as Error).message === 'INVALID_CREDENTIALS') {
      return NextResponse.json({ error: 'Incorrect email or account password.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
  }

  const otp = generateOtp();
  const hash = hashOtp(otp);
  const expiresAt = Date.now() + OTP_TTL_MS;

  try {
    await firestoreSet(projectId, idToken, `users/${uid}/2fa/emailOtp`, { hash, expiresAt });
  } catch {
    return NextResponse.json({ error: 'Failed to store OTP. Check Firestore rules.' }, { status: 502 });
  }

  const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px 32px;">
<tr><td align="center" style="padding-bottom:20px;">
  <div style="background:#1e1b4b;border-radius:50%;width:56px;height:56px;display:inline-flex;align-items:center;justify-content:center;">
    <span style="font-size:28px;">🔑</span>
  </div>
</td></tr>
<tr><td align="center" style="padding-bottom:8px;">
  <h1 style="margin:0;color:#f4f4f5;font-size:22px;font-weight:700;">2FA Recovery Code</h1>
</td></tr>
<tr><td align="center" style="padding-bottom:24px;">
  <p style="margin:0;color:#a1a1aa;font-size:14px;">Use this code to bypass your authenticator app. Valid for <strong style="color:#d4d4d8;">10 minutes</strong>.</p>
</td></tr>
<tr><td style="padding-bottom:24px;">
  <div style="background:#09090b;border:1px solid #3f3f46;border-radius:12px;padding:20px 24px;text-align:center;">
    <p style="margin:0 0 8px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Recovery Code</p>
    <p style="margin:0;color:#818cf8;font-size:32px;font-weight:700;font-family:monospace;letter-spacing:0.2em;">${otp}</p>
  </div>
</td></tr>
<tr><td style="padding-bottom:20px;">
  <div style="background:#431407;border:1px solid #7c2d12;border-radius:10px;padding:14px 18px;">
    <p style="margin:0;color:#fdba74;font-size:13px;line-height:1.6;">
      <strong>⚠️</strong> If you didn't request this, someone may be trying to access your account. Change your password immediately.
    </p>
  </div>
</td></tr>
<tr><td align="center">
  <p style="margin:0;color:#52525b;font-size:12px;">Mero Password Manager &mdash; 2FA Recovery</p>
</td></tr>
</table></td></tr></table>
</body></html>`.trim();

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Mero Passwords <onboarding@resend.dev>',
      to: [email],
      subject: `🔑 Your 2FA Recovery Code: ${otp}`,
      html,
    }),
  });

  if (!emailRes.ok) {
    return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
