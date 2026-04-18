export interface VaultItem {
  id: string;
  siteName: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  favorite?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface EncryptedVaultDoc {
  encryptedData: string;
  updatedAt?: number;
}
