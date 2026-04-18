"use client";

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { decryptData, encryptData, deriveKey } from '@/lib/crypto';
import { Download, Upload, RefreshCcw, Trash2, User, ShieldAlert, Smartphone } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';

type ImportTargetField = 'name' | 'username' | 'password' | 'url' | 'notes';

const FIELD_LABELS: Record<ImportTargetField, string> = {
  name: 'Name / Title',
  username: 'Username / Email',
  password: 'Password',
  url: 'URL / Website',
  notes: 'Notes',
};

type CsvRow = Record<string, string>;

export default function SettingsPage() {
  const { user, masterKey, setMasterKey } = useStore();
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
      const querySnapshot = await getDocs(collection(db, 'users', user.uid, 'passwords'));
      const passwords = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          name: decryptData(data.name, masterKey),
          username: decryptData(data.username, masterKey),
          password: decryptData(data.password, masterKey),
          url: data.url ? decryptData(data.url, masterKey) : '',
          notes: data.notes ? decryptData(data.notes, masterKey) : '',
        };
      });

      const headers = ['name', 'username', 'password', 'url', 'notes'];
      const csvContent = [
        headers.join(','),
        ...passwords.map(p => headers.map(h => `"${(p[h as keyof typeof p] ?? '').replace(/"/g, '""')}"`).join(','))
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
      const newMapping: Record<ImportTargetField, string | null> = { name: null, username: null, password: null, url: null, notes: null };
      for (const header of headers) {
        const lowerHeader = header.toLowerCase();
        if (lowerHeader.includes('name') || lowerHeader.includes('title')) newMapping.name = header;
        if (lowerHeader.includes('user')) newMapping.username = header;
        if (lowerHeader.includes('pass')) newMapping.password = header;
        if (lowerHeader.includes('url') || lowerHeader.includes('website')) newMapping.url = header;
        if (lowerHeader.includes('note')) newMapping.notes = header;
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
      const passwordsRef = collection(db, 'users', user.uid, 'passwords');

      csvRows.forEach(row => {
        const newDocRef = doc(passwordsRef);
        const encryptedData = {
          name: encryptData(mapping.name ? row[mapping.name] ?? '' : '', masterKey),
          username: encryptData(mapping.username ? row[mapping.username] ?? '' : '', masterKey),
          password: encryptData(mapping.password ? row[mapping.password] ?? '' : '', masterKey),
          url: encryptData(mapping.url ? row[mapping.url] ?? '' : '', masterKey),
          notes: encryptData(mapping.notes ? row[mapping.notes] ?? '' : '', masterKey),
          createdAt: new Date().toISOString(),
        };
        batch.set(newDocRef, encryptedData);
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
      const derivedKey = await deriveKey(user!.email!, currentMasterPasswordInput);
      if (derivedKey !== masterKey) {
        setMasterPasswordError('The current master password you entered is incorrect.');
        setLoadingMasterPasswordChange(false);
        return;
      }

      // Derive new master key
      const newKey = await deriveKey(user!.email!, newMasterPasswordInput);

      // Get all documents
      const passwordsRef = collection(db, 'users', user!.uid, 'passwords');
      const querySnapshot = await getDocs(passwordsRef);

      // Re-encrypt all data with the new key
      const batch = writeBatch(db);
      for (const document of querySnapshot.docs) {
        const data = document.data();
        const decrypted = {
          name: decryptData(data.name, masterKey),
          username: decryptData(data.username, masterKey),
          password: decryptData(data.password, masterKey),
          url: data.url ? decryptData(data.url, masterKey) : '',
          notes: data.notes ? decryptData(data.notes, masterKey) : '',
        };

        const reEncrypted = {
          name: encryptData(decrypted.name ?? '', newKey),
          username: encryptData(decrypted.username ?? '', newKey),
          password: encryptData(decrypted.password ?? '', newKey),
          url: encryptData(decrypted.url ?? '', newKey),
          notes: encryptData(decrypted.notes ?? '', newKey),
        };
        batch.update(document.ref, reEncrypted);
      }

      await batch.commit();

      // Update the master key in the store
      setMasterKey(newKey);
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
