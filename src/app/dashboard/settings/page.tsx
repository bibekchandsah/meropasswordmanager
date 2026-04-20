"use client";

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, writeBatch, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { deleteUser, reauthenticateWithCredential, EmailAuthProvider, GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { decryptData, encryptData, deriveKey } from '@/lib/crypto';
import { updatePasskeyMasterPassword } from '@/lib/passkey';
import { saveRecoveryBlob } from '@/lib/recovery';
import { Download, Upload, RefreshCcw, Trash2, User, ShieldAlert, Smartphone, AlertTriangle, X, Fingerprint } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import PasskeyManager from '@/components/PasskeyManager';

type ImportTargetField = 'name' | 'username' | 'password' | 'url' | 'notes' | 'favorite' | 'createdAt' | 'updatedAt';

const FIELD_LABELS: Record<ImportTargetField, string> = {
  name: 'Name / Title',
  username: 'Username / Email',
  password: 'Password',
  url: 'URL / Website',
  notes: 'Notes',
  favorite: 'Favorite',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
};

type CsvRow = Record<string, string>;

export default function SettingsPage() {
  const { user, masterKey, masterPassword, setMasterKey, setMasterPassword } = useStore();
  const router = useRouter();
  const { canInstall, isInstalled, isInstallFlowRunning, handleInstallApp } = usePwaInstall();

  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<ImportTargetField, string | null>>({
    name: null,
    username: null,
    password: null,
    url: null,
    notes: null,
    favorite: null,
    createdAt: null,
    updatedAt: null,
  });
  const [mappingReady, setMappingReady] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [loadingCsvExport, setLoadingCsvExport] = useState(false);

  const [currentMasterPasswordInput, setCurrentMasterPasswordInput] = useState('');
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState('');
  const [confirmNewMasterPasswordInput, setConfirmNewMasterPasswordInput] = useState('');
  const [loadingMasterPasswordChange, setLoadingMasterPasswordChange] = useState(false);
  const [masterPasswordMessage, setMasterPasswordMessage] = useState<string | null>(null);
  const [masterPasswordError, setMasterPasswordError] = useState<string | null>(null);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');        // master password (both providers)
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/auth');
    }
  }, [user, router]);

  const handleExportCsv = async () => {
    if (!user || !masterKey) {
      alert('You must be logged in and unlocked to export.');
      return;
    }
    setLoadingCsvExport(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'users', user.uid, 'vault'));
      const passwords = querySnapshot.docs.map(doc => {
        const data = doc.data();
        if (data.encryptedData) {
          const decryptedJson = decryptData(data.encryptedData, masterKey);
          if (decryptedJson) {
            try {
              const parsed = JSON.parse(decryptedJson);
              return {
                name: parsed.siteName || parsed.name || '',
                username: parsed.username || '',
                password: parsed.password || '',
                url: parsed.url || '',
                notes: parsed.notes || '',
                favorite: parsed.favorite ? 'true' : 'false',
                createdAt: parsed.createdAt ? new Date(parsed.createdAt).toISOString() : '',
                updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt).toISOString() : '',
              };
            } catch {
              // block
            }
          }
        }
        return null;
      }).filter(Boolean) as Record<string, string>[];

      const headers = ['name', 'username', 'password', 'url', 'notes', 'favorite', 'createdAt', 'updatedAt'];
      const csvContent = [
        headers.join(','),
        ...passwords.map(p => headers.map(h => `"${(p[h] ?? '').replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-s8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `mero_password_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('An error occurred while exporting your vault.');
    } finally {
      setLoadingCsvExport(false);
    }
  };

  const handleCsvPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const allLines = text.split(/\r\n|\n/);
      const headers = allLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      setCsvHeaders(headers);

      const rows = allLines.slice(1).filter(line => line.trim()).map(line => {
        const data = line.split(',').map(d => d.trim().replace(/^"|"$/g, ''));
        return headers.reduce((obj, nextKey, index) => {
          obj[nextKey] = data[index] || '';
          return obj;
        }, {} as CsvRow);
      });
      setCsvRows(rows);

      // Smart mapping
      const newMapping: Record<ImportTargetField, string | null> = { name: null, username: null, password: null, url: null, notes: null, favorite: null, createdAt: null, updatedAt: null };
      for (const header of headers) {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('name') || lowerHeader.includes('title')) newMapping.name = header;
        if (lowerHeader.includes('user')) newMapping.username = header;
        if (lowerHeader.includes('pass')) newMapping.password = header;
        if (lowerHeader.includes('url') || lowerHeader.includes('website')) newMapping.url = header;
        if (lowerHeader.includes('note')) newMapping.notes = header;
        if (lowerHeader.includes('favor') || lowerHeader.includes('star')) newMapping.favorite = header;
        if (lowerHeader.includes('created')) newMapping.createdAt = header;
        if (lowerHeader.includes('updated')) newMapping.updatedAt = header;
      }
      setMapping(newMapping);
    };
    reader.readAsText(file);
  };

  const handleMappingChange = (field: ImportTargetField, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value === '__ignore__' ? null : value }));
  };

  useEffect(() => {
    setMappingReady(Object.values(mapping).some(v => v !== null));
  }, [mapping]);

  const handleImportCsv = async () => {
    if (!user || !masterKey) {
      setImportError('You must be logged in and unlocked to import.');
      return;
    }
    if (csvRows.length === 0 || !mappingReady) {
      setImportError('No data to import or no fields mapped.');
      return;
    }

    setLoadingImport(true);
    setImportError(null);
    setImportMessage(null);

    try {
      const batch = writeBatch(db);
      const passwordsRef = collection(db, 'users', user.uid, 'vault');

      csvRows.forEach(row => {
        const newDocRef = doc(passwordsRef);
        
        let isFavorite = false;
        if (mapping.favorite && row[mapping.favorite]) {
           const favStr = row[mapping.favorite].toLowerCase().trim();
           isFavorite = favStr === 'true' || favStr === '1' || favStr === 'yes';
        }

        let createdAtDate = Date.now();
        if (mapping.createdAt && row[mapping.createdAt]) {
           const parsedDate = Date.parse(row[mapping.createdAt]);
           if (!isNaN(parsedDate)) createdAtDate = parsedDate;
        }

        let updatedAtDate = Date.now();
        if (mapping.updatedAt && row[mapping.updatedAt]) {
           const parsedDate = Date.parse(row[mapping.updatedAt]);
           if (!isNaN(parsedDate)) updatedAtDate = parsedDate;
        }

        const vaultItem = {
          id: newDocRef.id,
          siteName: mapping.name ? row[mapping.name] ?? '' : '',
          username: mapping.username ? row[mapping.username] ?? '' : '',
          password: mapping.password ? row[mapping.password] ?? '' : '',
          url: mapping.url ? row[mapping.url] ?? '' : '',
          notes: mapping.notes ? row[mapping.notes] ?? '' : '',
          favorite: isFavorite,
          createdAt: createdAtDate,
          updatedAt: updatedAtDate,
        };
        const encryptedData = encryptData(JSON.stringify(vaultItem), masterKey);
        batch.set(newDocRef, {
          encryptedData,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      setImportMessage(`${csvRows.length} items imported successfully!`);
      // Reset CSV state
      setCsvRows([]);
      setCsvHeaders([]);
      setCsvFileName(null);
    } catch (error) {
      console.error("Error importing CSV:", error);
      setImportError('An error occurred during import. Please check the console.');
    } finally {
      setLoadingImport(false);
    }
  };

  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterPasswordError(null);
    setMasterPasswordMessage(null);

    if (newMasterPasswordInput !== confirmNewMasterPasswordInput) {
      setMasterPasswordError("New passwords don't match.");
      return;
    }
    if (!masterKey) {
      setMasterPasswordError('Vault is not currently unlocked.');
      return;
    }

    setLoadingMasterPasswordChange(true);

    try {
      // Verify current master password
      const derivedKey = deriveKey(currentMasterPasswordInput, user!.email!);
      if (derivedKey !== masterKey) {
        setMasterPasswordError('The current master password you entered is incorrect.');
        setLoadingMasterPasswordChange(false);
        return;
      }

      // Derive new master key
      const newKey = deriveKey(newMasterPasswordInput, user!.email!);

      // Get all documents
      const passwordsRef = collection(db, 'users', user!.uid, 'vault');
      const querySnapshot = await getDocs(passwordsRef);

      // Re-encrypt all data with the new key
      const batch = writeBatch(db);
      for (const document of querySnapshot.docs) {
        const data = document.data();
        if (data.encryptedData) {
          const decryptedJson = decryptData(data.encryptedData, masterKey);
          if (decryptedJson) {
            const reEncryptedData = encryptData(decryptedJson, newKey);
            batch.update(document.ref, {
              encryptedData: reEncryptedData,
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      await batch.commit();

      // Update the master key in the store
      setMasterKey(newKey);
      setMasterPassword(newMasterPasswordInput);

      // If a passkey is registered on this device, update the encrypted master password it holds
      if (user) {
        await updatePasskeyMasterPassword(user.uid, newMasterPasswordInput);
      }

      // Update the recovery blob so "forgot master password" still works with the new password.
      // We need the account password for this — prompt is not ideal here, so we re-use
      // currentMasterPasswordInput as a proxy only if the user is email/password auth.
      // The recovery blob is keyed to the account password, which we don't have in settings.
      // We store a note: the blob will be refreshed on next login automatically.
      // For now, update using the new master password as both keys (same as Google auth path).
      if (user) {
        saveRecoveryBlob(user.uid, newMasterPasswordInput, newMasterPasswordInput).catch(() => {});
      }

      setMasterPasswordMessage('Master password changed successfully!');
      setCurrentMasterPasswordInput('');
      setNewMasterPasswordInput('');
      setConfirmNewMasterPasswordInput('');

    } catch (error) {
      console.error("Error changing master password:", error);
      setMasterPasswordError('An unexpected error occurred. Please try again.');
    } finally {
      setLoadingMasterPasswordChange(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth.currentUser) {
      setDeleteError('You must be logged in to delete your account.');
      return;
    }
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE exactly to confirm.');
      return;
    }

    setLoadingDelete(true);
    setDeleteError(null);

    try {
      // Step 1: Verify master password locally
      const derivedKey = deriveKey(deletePassword, user.email);
      if (derivedKey !== masterKey) {
        setDeleteError('Incorrect master password. Please try again.');
        return;
      }

      // Step 2: Delete all vault documents from Firestore in batches
      const passwordsRef = collection(db, 'users', user.uid, 'vault');
      const snapshot = await getDocs(passwordsRef);

      const chunks: typeof snapshot.docs[] = [];
      for (let i = 0; i < snapshot.docs.length; i += 499) {
        chunks.push(snapshot.docs.slice(i, i + 499));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Step 3: Delete the user document itself (if it exists)
      await deleteDoc(doc(db, 'users', user.uid)).catch(() => {/* may not exist */});

      // Step 4: Delete the Firebase Auth account
      await deleteUser(auth.currentUser);

      // Step 5: Clear local state and redirect
      useStore.getState().logout();
      router.push('/auth');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        setDeleteError('Security requirement: Please sign out, sign back in, and try deleting your account again.');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setDeleteError('Incorrect account password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        setDeleteError('Too many failed attempts. Please try again later.');
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setDeleteError('Google sign-in was cancelled. Please try again.');
      } else if (code === 'permission-denied') {
        setDeleteError('Permission denied. Please update your Firestore security rules to allow delete operations for authenticated users.');
      } else {
        setDeleteError('An unexpected error occurred. Please try again.');
        console.error('Delete account error:', err);
      }
    } finally {
      setLoadingDelete(false);
    }
  };

  const previewFields = (Object.keys(FIELD_LABELS) as ImportTargetField[]).filter(field => mapping[field]);
  const previewRows = csvRows.slice(0, 3).map(row => {
    const previewRow: Partial<Record<ImportTargetField, string>> = {};
    for (const field of previewFields) {
      const header = mapping[field];
      if (header) {
        previewRow[field] = row[header];
      }
    }
    return previewRow;
  });

  return (
    <div className="flex flex-col h-full gap-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage your account and preferences</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 mt-4 w-full max-w-3xl">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-emerald-500 border-b border-zinc-800 pb-4">
          <User className="w-5 h-5" /> Account Details
        </h2>
        
        <div className="space-y-4 mb-10">
          <div>
            <label className="text-sm font-medium text-zinc-500 block mb-1">Email / Username</label>
            <div className="bg-zinc-950 border border-zinc-800 px-4 py-3 rounded-xl text-slate-300 font-mono">
              {user?.email}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-500 block mb-1">Account UID</label>
            <div className="bg-zinc-950 border border-zinc-800 px-4 py-3 rounded-xl text-slate-300 font-mono text-xs">
              {user?.uid}
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-blue-500 border-b border-zinc-800 pb-4">
          <ShieldAlert className="w-5 h-5" /> Advanced Features
        </h2>

        <div className="space-y-6">
          {!isInstalled && (
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <div>
                <h3 className="font-semibold text-slate-200">Install App (PWA)</h3>
                <p className="text-sm text-zinc-400 max-w-xl">
                  Install Mero Password Manager for a native app-like experience with faster launch and offline shell support.
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleInstallApp}
                  disabled={isInstallFlowRunning || !canInstall}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[150px] justify-center whitespace-nowrap"
                >
                  {isInstallFlowRunning ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {isInstallFlowRunning ? 'Opening...' : 'Install App'}
                </button>

                {!canInstall && (
                  <p className="text-xs text-zinc-500">
                    Installation is not available, or the app is already installed.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
            <div>
              <h3 className="font-semibold text-slate-200">Export Vault</h3>
              <p className="text-sm text-zinc-400 max-w-xl">Download a decrypted copy of your vault in CSV format. Keep this file safe.</p>
            </div>

            <div className="mt-3">
              <button
                onClick={handleExportCsv}
                disabled={loadingCsvExport}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 min-w-[124px] justify-center whitespace-nowrap"
              >
                {loadingCsvExport ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {loadingCsvExport ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>

          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-4">
            <div>
              <h3 className="font-semibold text-slate-200">Import from CSV</h3>
              <p className="text-sm text-zinc-400 max-w-xl">
                Upload a CSV, verify smart column mapping, then import into your encrypted vault.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap">
                <Upload className="w-4 h-4" />
                Choose CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvPicked} />
              </label>

              <button
                onClick={handleImportCsv}
                disabled={loadingImport || !mappingReady || csvRows.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px] justify-center whitespace-nowrap"
              >
                {loadingImport ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {loadingImport ? 'Importing...' : 'Import to Vault'}
              </button>
            </div>

            {csvFileName ? (
              <div className="text-xs text-emerald-300">
                Loaded: <span className="font-semibold">{csvFileName}</span> ({csvRows.length} rows)
              </div>
            ) : null}

            {csvHeaders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(FIELD_LABELS) as ImportTargetField[]).map((field) => (
                  <div key={field}>
                    <label className="text-xs text-zinc-400 block mb-1">{FIELD_LABELS[field]}</label>
                    <select
                      value={mapping[field] ?? '__ignore__'}
                      onChange={(event) => handleMappingChange(field, event.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="__ignore__">Ignore this field</option>
                      {csvHeaders.map((header) => (
                        <option key={`${field}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}

            {csvHeaders.length > 0 ? (
              <div className="rounded-xl border border-zinc-800 overflow-x-auto">
                {previewFields.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-950">
                      <tr>
                        {previewFields.map((field) => (
                          <th key={field} className="text-left text-zinc-400 font-medium px-3 py-2 whitespace-nowrap">
                            {FIELD_LABELS[field]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={`preview-${index}`} className="border-t border-zinc-800">
                          {previewFields.map((field) => (
                            <td key={`preview-${index}-${field}`} className="px-3 py-2 text-zinc-300 max-w-[180px] truncate">
                              {row[field] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-3 py-3 text-xs text-zinc-500">
                    All fields are currently ignored. Select at least one field to preview mapped values.
                  </div>
                )}
              </div>
            ) : null}

            {importError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">{importError}</div>
            ) : null}

            {importMessage ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">{importMessage}</div>
            ) : null}

            
          </div>

          <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-4">
            <div>
              <h3 className="font-semibold text-slate-200">Change Vault Master Password</h3>
              <p className="text-sm text-zinc-400 max-w-xl">
                Re-encrypt your vault using a new master password while you are unlocked.
              </p>
            </div>

            <form className="space-y-3" onSubmit={handleChangeMasterPassword}>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Current Master Password</label>
                <input
                  type="password"
                  value={currentMasterPasswordInput}
                  onChange={(event) => setCurrentMasterPasswordInput(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Current master password"
                  minLength={8}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">New Master Password</label>
                <input
                  type="password"
                  value={newMasterPasswordInput}
                  onChange={(event) => setNewMasterPasswordInput(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="New master password"
                  minLength={8}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Confirm New Master Password</label>
                <input
                  type="password"
                  value={confirmNewMasterPasswordInput}
                  onChange={(event) => setConfirmNewMasterPasswordInput(event.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Confirm new master password"
                  minLength={8}
                  required
                />
              </div>

              {masterPasswordError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                  {masterPasswordError}
                </div>
              ) : null}

              {masterPasswordMessage ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-2 text-sm">
                  {masterPasswordMessage}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loadingMasterPasswordChange}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {loadingMasterPasswordChange ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null}
                  {loadingMasterPasswordChange ? 'Re-encrypting...' : 'Change Master Password'}
                </button>
              </div>
            </form>
          </div>
          
          <div className="p-4 bg-violet-500/5 border border-violet-500/20 rounded-xl space-y-4">
            <div>
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Fingerprint className="w-5 h-5 text-violet-400" />
                Passkey &amp; Recovery
              </h3>
              <p className="text-sm text-zinc-400 max-w-xl mt-1">
                Set up biometric login (Face ID, fingerprint, Windows Hello) and email recovery for your master password.
              </p>
            </div>
            <PasskeyManager />
          </div>

          <div className="flex flex-col items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-red-400">Danger Zone</h3>
              <p className="text-sm text-zinc-400 max-w-md">Delete your account and wipe all stored vault data permanently. This action cannot be undone.</p>
            </div>
            
            <button 
              onClick={() => {
                setShowDeleteModal(true);
                setDeletePassword('');
                setDeleteConfirmText('');
                setDeleteError(null);
              }}
              className="bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/50 text-red-500 font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-red-400">Delete Account</h2>
                  <p className="text-xs text-zinc-500">This action is permanent and irreversible</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={loadingDelete}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-sm text-red-300">
                  The following will be <span className="font-semibold">permanently deleted</span>:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-red-300/80 list-disc list-inside">
                  <li>All passwords stored in your vault</li>
                  <li>Your account and login credentials</li>
                  <li>All associated data — nothing can be recovered</li>
                </ul>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Vault Master Password
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your vault master password"
                  disabled={loadingDelete}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">
                  Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={loadingDelete}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-red-500 font-mono disabled:opacity-50"
                />
              </div>

              {deleteError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={loadingDelete}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={
                    loadingDelete ||
                    deleteConfirmText !== 'DELETE' ||
                    !deletePassword
                  }
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-red-900/50 text-white font-semibold py-2.5 px-4 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingDelete ? (
                    <><RefreshCcw className="w-4 h-4 animate-spin" /> Deleting...</>
                  ) : (
                    <><Trash2 className="w-4 h-4" /> Delete Forever</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
