import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';

/**
 * POST /api/forgot-master-password
 *
 * Flow:
 * 1. Accept { email, accountPassword } from the client (login screen).
 * 2. Verify the credentials against Firebase Auth REST API → get uid + idToken.
 * 3. Use the idToken to read users/{uid}/recovery/masterPassword from Firestore REST API.
 * 4. Derive the recovery key (accountPassword + uid) and decrypt the blob.
 * 5. Send the master password to the user's email via Resend.
 *
 * Security: the account password is required to decrypt the blob, so a random
 * person cannot trigger recovery for someone else's account.
 * The account password is never logged or stored by this route.
 */

// ─── Firebase helpers ────────────────────────────────────────────────────────

async function firebaseSignIn(
  apiKey: string,
  email: string,
  password: string
): Promise<{ uid: string; idToken: string; email: string }> {
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
    if (code === 'INVALID_PASSWORD' || code === 'EMAIL_NOT_FOUND' || code.startsWith('INVALID_LOGIN_CREDENTIALS')) {
      throw new Error('INVALID_CREDENTIALS');
    }
    if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER' || code.startsWith('TOO_MANY_ATTEMPTS')) {
      throw new Error('TOO_MANY_ATTEMPTS');
    }
    throw new Error('AUTH_ERROR');
  }

  const data = await res.json();
  return { uid: data.localId, idToken: data.idToken, email: data.email };
}

async function firestoreGetRecoveryBlob(
  projectId: string,
  uid: string,
  idToken: string
): Promise<string | null> {
  const path = `projects/${projectId}/databases/(default)/documents/users/${uid}/recovery/masterPassword`;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/${path}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    }
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Firestore REST error ${res.status}:`, body);

    if (res.status === 403) {
      throw new Error('FIRESTORE_PERMISSION_DENIED');
    }
    throw new Error(`FIRESTORE_ERROR:${res.status}`);
  }

  const data = await res.json();
  // Firestore REST returns fields as { fieldName: { stringValue: "..." } }
  return data?.fields?.encryptedBlob?.stringValue ?? null;
}

// ─── Crypto (server-side, using crypto-js — same as client) ─────────────────

function deriveRecoveryKey(accountPassword: string, uid: string): string {
  return CryptoJS.PBKDF2(accountPassword, `recovery:${uid}`, {
    keySize: 256 / 32,
    iterations: 100000,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Base64);
}

function decryptRecovery(encryptedBlob: string, recoveryKey: string): string | null {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedBlob, recoveryKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) return null;
    const parsed = JSON.parse(decrypted);
    if (parsed?.v === 1 && typeof parsed?.mp === 'string') return parsed.mp;
    return null;
  } catch {
    return null;
  }
}

// ─── Email ───────────────────────────────────────────────────────────────────

async function sendRecoveryEmail(
  resendApiKey: string,
  email: string,
  masterPassword: string
): Promise<void> {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Vault Master Password</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:40px 32px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="background:#052e16;border-radius:50%;width:56px;height:56px;display:inline-flex;align-items:center;justify-content:center;">
                <span style="font-size:28px;">🔐</span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="margin:0;color:#f4f4f5;font-size:22px;font-weight:700;">Vault Master Password Recovery</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <p style="margin:0;color:#a1a1aa;font-size:14px;">
                A recovery request was made for <strong style="color:#d4d4d8;">${email}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:28px;">
              <div style="background:#09090b;border:1px solid #3f3f46;border-radius:12px;padding:20px 24px;text-align:center;">
                <p style="margin:0 0 8px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Your Master Password</p>
                <p style="margin:0;color:#10b981;font-size:20px;font-weight:700;font-family:monospace;letter-spacing:0.05em;word-break:break-all;">${masterPassword}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <div style="background:#431407;border:1px solid #7c2d12;border-radius:10px;padding:14px 18px;">
                <p style="margin:0;color:#fdba74;font-size:13px;line-height:1.6;">
                  <strong>⚠️ Security notice:</strong> Delete this email after saving your master password in a safe place. Anyone with access to this email can decrypt your vault.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="margin:0;color:#52525b;font-size:12px;">
                Mero Password Manager &mdash; Zero-knowledge vault
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Mero Passwords <onboarding@resend.dev>',
      to: [email],
      subject: '🔐 Your Vault Master Password Recovery',
      html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Resend API error:', res.status, errBody);
    throw new Error('EMAIL_SEND_FAILED');
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const resendApiKey = process.env.RESEND_EMAIL_API_KEY;

  if (!firebaseApiKey || !projectId) {
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 503 });
  }
  if (!resendApiKey) {
    return NextResponse.json({ error: 'Email service is not configured.' }, { status: 503 });
  }

  let body: { email?: string; accountPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { email, accountPassword } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }
  if (!accountPassword || typeof accountPassword !== 'string' || accountPassword.length < 1) {
    return NextResponse.json({ error: 'Account password is required.' }, { status: 400 });
  }

  // Step 1: Verify credentials
  let uid: string;
  let idToken: string;
  let verifiedEmail: string;

  try {
    ({ uid, idToken, email: verifiedEmail } = await firebaseSignIn(firebaseApiKey, email, accountPassword));
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg === 'INVALID_CREDENTIALS') {
      return NextResponse.json({ error: 'Incorrect email or account password.' }, { status: 401 });
    }
    if (msg === 'TOO_MANY_ATTEMPTS') {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
  }

  // Step 2: Read recovery blob from Firestore
  let encryptedBlob: string | null;
  try {
    encryptedBlob = await firestoreGetRecoveryBlob(projectId, uid, idToken);
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'FIRESTORE_PERMISSION_DENIED') {
      return NextResponse.json(
        {
          error:
            'Permission denied reading recovery data. Please add this rule to your Firestore security rules:\n\nmatch /users/{uid}/recovery/{doc} { allow read, write: if request.auth.uid == uid; }',
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Could not read recovery data. Please try again.' },
      { status: 502 }
    );
  }

  if (!encryptedBlob) {
    return NextResponse.json(
      {
        error:
          'No recovery data found for this account. You need to log in at least once after this feature was added for recovery to work.',
      },
      { status: 404 }
    );
  }

  // Step 3: Decrypt
  const recoveryKey = deriveRecoveryKey(accountPassword, uid);
  const masterPassword = decryptRecovery(encryptedBlob, recoveryKey);

  if (!masterPassword) {
    return NextResponse.json(
      { error: 'Could not decrypt recovery data. The account password may have changed.' },
      { status: 422 }
    );
  }

  // Step 4: Send email
  try {
    await sendRecoveryEmail(resendApiKey, verifiedEmail, masterPassword);
  } catch {
    return NextResponse.json({ error: 'Failed to send recovery email. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
