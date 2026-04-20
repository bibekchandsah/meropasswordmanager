/**
 * Master-password recovery helpers (client-side).
 *
 * Stores an encrypted copy of the master password in Firestore at
 *   users/{uid}/recovery/masterPassword
 *
 * The encryption key is derived from the user's account password + UID, so
 * only someone who knows the account password can trigger recovery via the
 * API route — preventing strangers from emailing themselves your master password.
 */

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deriveRecoveryKey, encryptRecovery } from '@/lib/crypto';

/**
 * Save (or update) the encrypted master password recovery blob in Firestore.
 * Call this after every successful login, signup, and master-password change.
 */
export async function saveRecoveryBlob(
  uid: string,
  accountPassword: string,
  masterPassword: string
): Promise<void> {
  const recoveryKey = deriveRecoveryKey(accountPassword, uid);
  const encryptedBlob = encryptRecovery(masterPassword, recoveryKey);

  await setDoc(
    doc(db, 'users', uid, 'recovery', 'masterPassword'),
    {
      encryptedBlob,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
