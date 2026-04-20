import CryptoJS from 'crypto-js';

// Derive an encryption key from the user's master password and their email as the salt.
export const deriveKey = (password: string, salt: string): string => {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000,
    hasher: CryptoJS.algo.SHA256
  }).toString(CryptoJS.enc.Base64);
};

// Encrypt payload (stringified JSON)
export const encryptData = (data: string, secretKey: string): string => {
  return CryptoJS.AES.encrypt(data, secretKey).toString();
};

// Decrypt encrypted payload
export const decryptData = (encryptedData: string, secretKey: string): string | null => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) return null;

    // Wrong keys can produce random text; only accept JSON-like payloads.
    const trimmed = decrypted.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }

    return decrypted;
  } catch {
    // Expected when using a different master key/password for existing vault data.
    return null;
  }
};

/**
 * Derive a recovery wrapping key from the user's account password and their UID.
 * This is separate from the vault key so that knowing the account password is
 * required to decrypt the stored master password recovery blob.
 */
export const deriveRecoveryKey = (accountPassword: string, uid: string): string => {
  return CryptoJS.PBKDF2(accountPassword, `recovery:${uid}`, {
    keySize: 256 / 32,
    iterations: 100000,
    hasher: CryptoJS.algo.SHA256,
  }).toString(CryptoJS.enc.Base64);
};

/**
 * Encrypt the master password for recovery storage.
 * Wraps the value in a JSON envelope so decryption can validate integrity.
 */
export const encryptRecovery = (masterPassword: string, recoveryKey: string): string => {
  const payload = JSON.stringify({ mp: masterPassword, v: 1 });
  return CryptoJS.AES.encrypt(payload, recoveryKey).toString();
};

/**
 * Decrypt the recovery blob. Returns the master password string or null if
 * the key is wrong / data is corrupt.
 */
export const decryptRecovery = (encryptedBlob: string, recoveryKey: string): string | null => {
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
};
