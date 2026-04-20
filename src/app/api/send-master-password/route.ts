import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/send-master-password
 *
 * Sends the user's master password to their registered email via Resend.
 *
 * Body: { email: string; masterPassword: string }
 *
 * The master password is passed from the client (it is already in memory
 * when the user is logged in and requests the email).  We never store it
 * server-side; this route is purely a mail relay.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.RESEND_EMAIL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email service is not configured.' },
      { status: 503 }
    );
  }

  let body: { email?: string; masterPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { email, masterPassword } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }
  if (!masterPassword || typeof masterPassword !== 'string' || masterPassword.length < 1) {
    return NextResponse.json({ error: 'Master password is missing.' }, { status: 400 });
  }

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
              <h1 style="margin:0;color:#f4f4f5;font-size:22px;font-weight:700;">Vault Master Password</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <p style="margin:0;color:#a1a1aa;font-size:14px;">
                You requested your vault master password for <strong style="color:#d4d4d8;">${email}</strong>.
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
</html>
  `.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mero Passwords <onboarding@resend.dev>',
        to: [email],
        subject: '🔐 Your Vault Master Password',
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend API error:', res.status, errBody);
      return NextResponse.json(
        { error: 'Failed to send email. Please try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Email send error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
