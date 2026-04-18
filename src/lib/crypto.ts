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
