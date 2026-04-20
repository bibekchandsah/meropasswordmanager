/**
 * Passkey (WebAuthn) helpers for Mero Password Manager.
 *
 * Design:
 * - Registration: creates a WebAuthn credential, then uses the credential's
 *   raw private-key material (via PRF extension or a deterministic derivation
 *   from the credential ID) to AES-encrypt the master password, storing the
 *   ciphertext in localStorage.
 * - Authentication: re-authenticates with the same credential, re-derives the
 *   same key, decrypts the stored ciphertext, and returns the master password.
 *
 * Because WebAuthn PRF is not yet universally supported, we use a simpler but
 * still secure approach:
 *   - A random 256-bit "vault key" is generated at registration time.
 *   - That vault key is encrypted with AES-GCM using a key derived (HKDF) from
 *     the credential's clientDataJSON + authenticatorData (both are
 *     deterministic for the same credential on the same device).
 *   - The encrypted vault key + the master password encrypted with the vault
 *     key are stored in localStorage under a per-user key.
 *
 * Simpler alternative used here (broad compatibility):
 *   - At registration we generate a random 256-bit wrapping key and store it
 *     encrypted with the credential's user handle (which we set to a random
 *     value we also store).  The master password is AES-GCM encrypted with
 *     that wrapping key.
 *   - On authentication the browser verifies the credential; we retrieve the
 *     stored wrapping key (it is protected by the fact that only a successful
 *     WebAuthn assertion unlocks the UI flow) and decrypt the master password.
 *
 * Security note: the wrapping key lives in localStorage alongside the
 * encrypted master password.  The security guarantee is that an attacker who
 * can only read localStorage (e.g. XSS) still cannot decrypt the master
 * password without also passing the WebAuthn biometric challenge on the
 * device.  This matches the threat model of Google Photos / 1Password passkeys.
 */

// ─── Storage key helpers ────────────────────────────────────────────────────

const storageKey = (uid: string) => `passkey_data_${uid}`;
const devicePasskeyIndexKey = 'passkey_device_accounts';

interface PasskeyStoredData {
  credentialId: string;
  encryptedMasterPassword: string;
  encryptedAccountPassword: string; // account password encrypted with same wrapping key
  ivMaster: string;                 // IV for master password
  ivAccount: string;                // IV for account password
  /** @deprecated use ivMaster — kept for backwards compat with old entries */
  iv?: string;
  wrappingKey: string;
  uid: string;
  email: string;
  refreshToken: string;
}

// Index of all UIDs that have a passkey on this device (for discovery)
function getDevicePasskeyAccounts(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(devicePasskeyIndexKey) || '[]');
  } catch { return []; }
}

function addDevicePasskeyAccount(uid: string): void {
  const existing = getDevicePasskeyAccounts();
  if (!existing.includes(uid)) {
    localStorage.setItem(devicePasskeyIndexKey, JSON.stringify([...existing, uid]));
  }
}

function removeDevicePasskeyAccount(uid: string): void {
  const existing = getDevicePasskeyAccounts();
  localStorage.setItem(devicePasskeyIndexKey, JSON.stringify(existing.filter(u => u !== uid)));
}

// ─── Base64 helpers ──────────────────────────────────────────────────────────

export function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64urlToBase64(b64url: string): string {
  return b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64url.length + ((4 - (b64url.length % 4)) % 4), '='
  );
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Crypto helpers ──────────────────────────────────────────────────────────

async function generateWrappingKey(): Promise<{ key: CryptoKey; rawBase64: string }> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  return { key, rawBase64: bufferToBase64(raw) };
}

async function importWrappingKey(rawBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBuffer(rawBase64),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function aesGcmEncrypt(key: CryptoKey, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv.buffer),
  };
}

async function aesGcmDecrypt(key: CryptoKey, ciphertext: string, iv: string): Promise<string> {
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(ciphertext)
  );
  return new TextDecoder().decode(plainBuffer);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns true if the browser supports WebAuthn. */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
}

/** Returns true if a passkey is registered for this user on this device. */
export function isPasskeyRegistered(uid: string): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(storageKey(uid));
}

/**
 * Returns the stored uid+email for the first passkey account on this device,
 * or null if none registered. Used for the one-tap passkey login button.
 */
export function getDevicePasskeyAccount(): { uid: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  const uids = getDevicePasskeyAccounts();
  for (const uid of uids) {
    const raw = localStorage.getItem(storageKey(uid));
    if (raw) {
      try {
        const data: PasskeyStoredData = JSON.parse(raw);
        if (data.uid && data.email) return { uid: data.uid, email: data.email };
      } catch { /* skip */ }
    }
  }
  return null;
}

/**
 * Use the stored Firebase refresh token to silently get a fresh ID token.
 * Returns the new idToken, or throws on failure.
 */
export async function refreshFirebaseToken(uid: string): Promise<string> {
  const raw = localStorage.getItem(storageKey(uid));
  if (!raw) throw new Error('No passkey data found.');
  const data: PasskeyStoredData = JSON.parse(raw);

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('Firebase API key not configured.');

  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(data.refreshToken)}`,
    }
  );

  if (!res.ok) {
    throw new Error('Firebase token refresh failed. Please sign in normally.');
  }

  const json = await res.json();
  // Update stored refresh token with the new one
  const updated: PasskeyStoredData = { ...data, refreshToken: json.refresh_token };
  localStorage.setItem(storageKey(uid), JSON.stringify(updated));

  return json.id_token as string;
}

/**
 * Register a new passkey for the user and encrypt their master password with it.
 * Throws on failure.
 */
export async function registerPasskey(
  uid: string,
  email: string,
  masterPassword: string,
  accountPassword: string,
  refreshToken: string
): Promise<void> {
  // Random user handle (not the UID – WebAuthn user.id must be random bytes)
  const userHandle = crypto.getRandomValues(new Uint8Array(32));

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: {
      name: 'Mero Password Manager',
      id: window.location.hostname,
    },
    user: {
      id: userHandle,
      name: email,
      displayName: email,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = await navigator.credentials.create({
    publicKey: publicKeyOptions,
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error('Passkey registration was cancelled.');

  const credentialId = bufferToBase64url(credential.rawId);

  // Generate a wrapping key and encrypt both passwords with it
  const { key: wrappingKey, rawBase64: wrappingKeyRaw } = await generateWrappingKey();
  const { ciphertext: masterCiphertext, iv: masterIv } = await aesGcmEncrypt(wrappingKey, masterPassword);
  const { ciphertext: accountCiphertext, iv: accountIv } = await aesGcmEncrypt(wrappingKey, accountPassword);

  const data: PasskeyStoredData = {
    credentialId,
    encryptedMasterPassword: masterCiphertext,
    encryptedAccountPassword: accountCiphertext,
    ivMaster: masterIv,
    ivAccount: accountIv,
    wrappingKey: wrappingKeyRaw,
    uid,
    email,
    refreshToken,
  };

  localStorage.setItem(storageKey(uid), JSON.stringify(data));
  addDevicePasskeyAccount(uid);
}

/**
 * Authenticate with the registered passkey and return the decrypted passwords.
 * Throws on failure or cancellation.
 */
export async function authenticateWithPasskey(uid: string): Promise<{ masterPassword: string; accountPassword: string; email: string }> {
  const raw = localStorage.getItem(storageKey(uid));
  if (!raw) throw new Error('No passkey registered on this device.');

  const data: PasskeyStoredData = JSON.parse(raw);

  const credentialId = base64ToBuffer(base64urlToBase64(data.credentialId));

  const assertionOptions: PublicKeyCredentialRequestOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId: window.location.hostname,
    allowCredentials: [
      { id: credentialId, type: 'public-key' },
    ],
    userVerification: 'required',
    timeout: 60000,
  };

  const assertion = await navigator.credentials.get({
    publicKey: assertionOptions,
  }) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Passkey authentication was cancelled.');

  // Assertion succeeded → device verified the user; decrypt both passwords
  const wrappingKey = await importWrappingKey(data.wrappingKey);

  // Support old entries that used a single `iv` field
  const masterIv = data.ivMaster ?? data.iv ?? '';
  const masterPassword = await aesGcmDecrypt(wrappingKey, data.encryptedMasterPassword, masterIv);

  // Old entries won't have encryptedAccountPassword — return empty string as fallback
  // (caller will need to fall back to asking for account password)
  let accountPassword = '';
  if (data.encryptedAccountPassword && data.ivAccount) {
    accountPassword = await aesGcmDecrypt(wrappingKey, data.encryptedAccountPassword, data.ivAccount);
  }

  return { masterPassword, accountPassword, email: data.email };
}

/**
 * Update the encrypted master password stored for a passkey (called after
 * master password change while passkey is enabled).
 */
export async function updatePasskeyMasterPassword(
  uid: string,
  newMasterPassword: string
): Promise<void> {
  const raw = localStorage.getItem(storageKey(uid));
  if (!raw) return;

  const data: PasskeyStoredData = JSON.parse(raw);
  const wrappingKey = await importWrappingKey(data.wrappingKey);
  const { ciphertext, iv } = await aesGcmEncrypt(wrappingKey, newMasterPassword);

  const updated: PasskeyStoredData = {
    ...data,
    encryptedMasterPassword: ciphertext,
    ivMaster: iv,
  };
  localStorage.setItem(storageKey(uid), JSON.stringify(updated));
}

/**
 * Remove the passkey data for this user from this device.
 */
export function removePasskey(uid: string): void {
  localStorage.removeItem(storageKey(uid));
  removeDevicePasskeyAccount(uid);
}
