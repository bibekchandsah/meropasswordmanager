'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { decryptData, encryptData, deriveKey } from '@/lib/crypto';
import { Download, RefreshCcw, Smartphone, User, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { VaultItem } from '@/types/vault';
import { ImportTargetField, mapCsvRowsToVaultItems, parseCsv, suggestColumnMapping, vaultItemsToCsv } from '@/lib/csv';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type ColumnMapping = Record<ImportTargetField, string | null>;

const REQUIRED_FIELDS: ImportTargetField[] = ['siteName', 'username', 'password'];

const FIELD_LABELS: Record<ImportTargetField, string> = {
  siteName: 'Site / App Name *',
  username: 'Username / Email *',
  password: 'Password *',
  url: 'URL',
  notes: 'Notes',
  favorite: 'Favorite'
};

export default function SettingsPage() {
  const { user, masterKey, setMasterKey } = useStore();
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isInstallFlowRunning, setIsInstallFlowRunning] = useState(false);
  const [loadingCsvExport, setLoadingCsvExport] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingMasterPasswordChange, setLoadingMasterPasswordChange] = useState(false);
  const [importError, setImportError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [masterPasswordError, setMasterPasswordError] = useState('');
  const [masterPasswordMessage, setMasterPasswordMessage] = useState('');
  const [currentMasterPasswordInput, setCurrentMasterPasswordInput] = useState('');
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState('');
  const [confirmNewMasterPasswordInput, setConfirmNewMasterPasswordInput] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    siteName: null,
    username: null,
    password: null,
    url: null,
    notes: null,
    favorite: null
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkInstalled = () => {
      const standaloneByMedia = window.matchMedia('(display-mode: standalone)').matches;
      const standaloneByNavigator = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setIsPwaInstalled(standaloneByMedia || standaloneByNavigator);
    };

    checkInstalled();

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsPwaInstalled(true);
      setInstallPromptEvent(null);
      setIsInstallFlowRunning(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const mappingReady = REQUIRED_FIELDS.every((field) => Boolean(mapping[field]));

  const loadDecryptedVault = async (): Promise<VaultItem[]> => {
    if (!user || !masterKey) return [];

    const q = query(collection(db, `users/${user.uid}/vault`));
    const snap = await getDocs(q);

    const decryptedVault: VaultItem[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.encryptedData) return;

      const decryptedJson = decryptData(data.encryptedData, masterKey);
      if (!decryptedJson) return;

      try {
        const parsed: VaultItem = JSON.parse(decryptedJson);
        decryptedVault.push(parsed);
      } catch {
        // Skip entries that cannot be parsed with current session key.
      }
    });

    return decryptedVault;
  };

  const handleExportCsv = async () => {
    if (!user || !masterKey) return;
    setLoadingCsvExport(true);

    try {
      const decryptedVault = await loadDecryptedVault();
      const csvText = vaultItemsToCsv(decryptedVault);
      const csvBlob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(csvBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `meropasswordmanager_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV export failed', e);
      alert('Failed to export CSV.');
    } finally {
      setLoadingCsvExport(false);
    }
  };

  const handleCsvPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setImportError('');
    setImportMessage('');

    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Please select a valid CSV file.');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsv(text);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setImportError('CSV is empty or missing a header row.');
        setCsvFileName('');
        setCsvHeaders([]);
        setCsvRows([]);
        return;
      }

      setCsvFileName(file.name);
      setCsvHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setMapping(suggestColumnMapping(parsed.headers));
      setImportMessage(`Loaded ${parsed.rows.length} rows. Review and confirm the mapping.`);
    } catch (e) {
      console.error('Failed to parse CSV', e);
      setImportError('Unable to read CSV file. Please verify the format.');
      setCsvFileName('');
      setCsvHeaders([]);
      setCsvRows([]);
    } finally {
      event.target.value = '';
    }
  };

  const handleMappingChange = (field: ImportTargetField, header: string) => {
    setMapping((current) => ({
      ...current,
      [field]: header === '__ignore__' ? null : header
    }));
  };

  const handleImportCsv = async () => {
    if (!user || !masterKey || csvRows.length === 0 || csvHeaders.length === 0) return;
    if (!mappingReady) {
      setImportError('Map Site/App, Username, and Password before import.');
      return;
    }

    setLoadingImport(true);
    setImportError('');
    setImportMessage('');

    try {
      const { items, skippedRows } = mapCsvRowsToVaultItems(csvRows, csvHeaders, mapping);

      if (items.length === 0) {
        setImportError('No valid rows found after mapping.');
        return;
      }

      await Promise.all(
        items.map(async (item) => {
          const id = crypto.randomUUID();
          const encryptedData = encryptData(JSON.stringify({ ...item, id }), masterKey);
          const docRef = doc(db, `users/${user.uid}/vault`, id);
          await setDoc(docRef, {
            encryptedData,
            updatedAt: serverTimestamp()
          });
        })
      );

      const skippedText = skippedRows > 0 ? ` (${skippedRows} rows skipped)` : '';
      setImportMessage(`Imported ${items.length} entries successfully${skippedText}.`);
    } catch (e) {
      console.error('Import failed', e);
      setImportError('Import failed. Please check the file and try again.');
    } finally {
      setLoadingImport(false);
    }
  };

  const handleChangeMasterPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user || !masterKey) return;

    setMasterPasswordError('');
    setMasterPasswordMessage('');

    if (!currentMasterPasswordInput || !newMasterPasswordInput || !confirmNewMasterPasswordInput) {
      setMasterPasswordError('Fill in all master password fields.');
      return;
    }

    if (newMasterPasswordInput.length < 8) {
      setMasterPasswordError('New master password must be at least 8 characters.');
      return;
    }

    if (newMasterPasswordInput !== confirmNewMasterPasswordInput) {
      setMasterPasswordError('New master password and confirmation do not match.');
      return;
    }

    const derivedCurrentKey = deriveKey(currentMasterPasswordInput, user.email);
    if (derivedCurrentKey !== masterKey) {
      setMasterPasswordError('Current master password is incorrect.');
      return;
    }

    const newDerivedKey = deriveKey(newMasterPasswordInput, user.email);

    setLoadingMasterPasswordChange(true);

    try {
      const q = query(collection(db, `users/${user.uid}/vault`));
      const snap = await getDocs(q);

      const docsToReEncrypt: Array<{ id: string; payload: string }> = [];
      let unreadableCount = 0;

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.encryptedData) {
          unreadableCount += 1;
          return;
        }

        const decryptedJson = decryptData(data.encryptedData, masterKey);
        if (!decryptedJson) {
          unreadableCount += 1;
          return;
        }

        docsToReEncrypt.push({ id: docSnap.id, payload: decryptedJson });
      });

      if (unreadableCount > 0) {
        setMasterPasswordError(
          `Unable to decrypt ${unreadableCount} item(s) with the current key. Export/repair data first, then retry.`
        );
        return;
      }

      await Promise.all(
        docsToReEncrypt.map(async ({ id, payload }) => {
          const encryptedData = encryptData(payload, newDerivedKey);
          const docRef = doc(db, `users/${user.uid}/vault`, id);
          await setDoc(docRef, {
            encryptedData,
            updatedAt: serverTimestamp(),
          });
        })
      );

      setMasterKey(newDerivedKey);
      setCurrentMasterPasswordInput('');
      setNewMasterPasswordInput('');
      setConfirmNewMasterPasswordInput('');
      setMasterPasswordMessage('Master password updated and vault re-encrypted successfully.');
    } catch (error) {
      console.error('Failed to change master password', error);
      setMasterPasswordError('Failed to change master password. Please try again.');
    } finally {
      setLoadingMasterPasswordChange(false);
    }
  };

  const previewFields = (Object.keys(FIELD_LABELS) as ImportTargetField[]).filter((field) => Boolean(mapping[field]));

  const previewRows = csvRows.slice(0, 3).map((row) => {
    const mappedRow: Record<ImportTargetField, string> = {
      siteName: '',
      username: '',
      password: '',
      url: '',
      notes: '',
      favorite: ''
    };

    (Object.keys(FIELD_LABELS) as ImportTargetField[]).forEach((field) => {
      const header = mapping[field];
      if (!header) return;

      const headerIndex = csvHeaders.indexOf(header);
      if (headerIndex < 0) return;
      mappedRow[field] = row[headerIndex] ?? '';
    });

    return mappedRow;
  });

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;

    setIsInstallFlowRunning(true);

    try {
      await installPromptEvent.prompt();
      const result = await installPromptEvent.userChoice;

      if (result.outcome === 'accepted') {
        setInstallPromptEvent(null);
      }
    } finally {
      setIsInstallFlowRunning(false);
    }
  };

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
          {!isPwaInstalled ? (
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
                  disabled={!installPromptEvent || isInstallFlowRunning}
                  className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[150px] justify-center whitespace-nowrap"
                >
                  {isInstallFlowRunning ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {isInstallFlowRunning ? 'Opening...' : 'Install App'}
                </button>

                {!installPromptEvent ? (
                  <p className="text-xs text-zinc-500">
                    If the button is disabled, open your browser menu and choose "Install app" or "Add to Home screen".
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

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
          
          <div className="flex flex-col items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-xl sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-red-400">Danger Zone</h3>
              <p className="text-sm text-zinc-400 max-w-md">Delete your account and wipe all stored vault data permanently.</p>
            </div>
            
            <button 
              onClick={() => alert("Manual account deletion hasn't been enabled in the MVP demo, please clear Firestore in your Firebase Console.")}
              className="bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/50 text-red-500 font-semibold py-2 px-4 rounded-xl inline-flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
