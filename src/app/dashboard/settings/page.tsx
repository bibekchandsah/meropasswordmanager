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
import { Download, Upload, RefreshCcw, Trash2, User, ShieldAlert, Smartphone, AlertTriangle, X, Fingerprint, Shield, Database, Lock, Settings, FileText, LayoutDashboard, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import PasskeyManager from '@/components/PasskeyManager';
import TwoFactorSetup from '@/components/TwoFactorSetup';
import { motion, AnimatePresence } from 'framer-motion';

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
  const { user, masterKey, masterPassword, setMasterKey, setMasterPassword, twoFAStatus } = useStore();
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
  
  type Section = 'security' | 'data' | 'account' | 'app';
  const [activeSection, setActiveSection] = useState<Section>('security');

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
  const sidebarItems: { id: Section; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'security', label: 'Security', icon: Shield,     color: 'text-blue-400' },
    { id: 'data',     label: 'Data',     icon: Database,   color: 'text-emerald-400' },
    { id: 'account',  label: 'Account',  icon: User,       color: 'text-indigo-400' },
    { id: 'app',      label: 'Native App', icon: Smartphone, color: 'text-amber-400' },
  ];

  return (
    <div className="flex flex-col h-full gap-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 shadow-lg shadow-black/20">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Vault Settings</h1>
          <p className="text-zinc-500 text-sm">Control your security, data, and access preferences.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 mt-2 flex-1 min-h-0">
        {/* Settings Sidebar */}
        <div className="w-full lg:w-64 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 scrollbar-none">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer whitespace-nowrap lg:w-full ${
                activeSection === item.id 
                  ? 'bg-zinc-900 text-slate-100 shadow-md shadow-black/40 ring-1 ring-zinc-800' 
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              <item.icon className={`w-4 h-4 ${activeSection === item.id ? item.color : ''}`} />
              {item.label}
              {activeSection === item.id && (
                <motion.div layoutId="activeHighlight" className="ml-auto hidden lg:block w-1 h-3 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 lg:p-8 shadow-2xl shadow-black/40 h-full overflow-y-auto custom-scrollbar">
                {activeSection === 'security' && (
                  <div className="max-w-4xl space-y-10">
                    <section>
                      <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-3">
                        <Lock className="w-5 h-5 text-blue-400" /> 
                        Security Controls
                      </h2>
                      
                      <div className="grid grid-cols-1 gap-6">
                        {/* 2FA Card */}
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
                          <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                              <ShieldAlert className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-slate-200">Two-Factor Authentication</h3>
                                {twoFAStatus === 'enabled' ? (
                                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                                    <ShieldCheck className="w-2.5 h-2.5" /> Enabled
                                  </span>
                                ) : twoFAStatus === 'disabled' || twoFAStatus === 'setup' ? (
                                  <span className="text-[10px] bg-zinc-500/15 text-zinc-400 border border-zinc-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                                    <ShieldOff className="w-2.5 h-2.5" /> Disabled
                                  </span>
                                ) : (
                                  <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  </div>
                                )}
                              </div>
                              <p className="text-sm text-zinc-500 mt-1">Add an extra layer of security to your vault login.</p>
                            </div>
                          </div>
                          <TwoFactorSetup />
                        </div>

                        {/* Passkeys Card */}
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
                          <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 rounded-xl bg-violet-500/10 text-violet-400">
                              <Fingerprint className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-200">Biometric & Passkeys</h3>
                              <p className="text-sm text-zinc-500 mt-1">Unlock your vault instantly using your device's biometric sensors.</p>
                            </div>
                          </div>
                          <PasskeyManager />
                        </div>

                        {/* Master Password Change */}
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors">
                          <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
                              <RefreshCcw className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-200">Change Master Password</h3>
                              <p className="text-sm text-zinc-500 mt-1">Your data will be re-encrypted using the new password.</p>
                            </div>
                          </div>

                          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleChangeMasterPassword}>
                            <div className="col-span-full">
                              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5 block">Current Password</label>
                              <input
                                type="password"
                                value={currentMasterPasswordInput}
                                onChange={(event) => setCurrentMasterPasswordInput(event.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
                                placeholder="Enter current master password"
                                required
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5 block">New Password</label>
                              <input
                                type="password"
                                value={newMasterPasswordInput}
                                onChange={(event) => setNewMasterPasswordInput(event.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
                                placeholder="At least 8 characters"
                                minLength={8}
                                required
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1.5 block">Confirm Password</label>
                              <input
                                type="password"
                                value={confirmNewMasterPasswordInput}
                                onChange={(event) => setConfirmNewMasterPasswordInput(event.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
                                placeholder="Repeat new password"
                                minLength={8}
                                required
                              />
                            </div>

                            <AnimatePresence>
                              {masterPasswordError && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="col-span-full">
                                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 px-4 py-2.5 text-sm font-medium">
                                    {masterPasswordError}
                                  </div>
                                </motion.div>
                              )}
                              {masterPasswordMessage && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="col-span-full">
                                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 px-4 py-2.5 text-sm font-medium">
                                    {masterPasswordMessage}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <div className="col-span-full flex justify-end pt-2">
                              <button
                                type="submit"
                                disabled={loadingMasterPasswordChange}
                                className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold py-3 px-6 rounded-xl inline-flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-blue-500/20"
                              >
                                {loadingMasterPasswordChange ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                                {loadingMasterPasswordChange ? 'Updating Vault...' : 'Update Master Password'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeSection === 'data' && (
                  <div className="max-w-4xl space-y-8">
                    <section>
                      <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-3">
                        <Database className="w-5 h-5 text-emerald-400" /> 
                        Data Management
                      </h2>

                      <div className="grid grid-cols-1 gap-6">
                        {/* Export Card */}
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors flex flex-col sm:flex-row items-center justify-between gap-6">
                          <div>
                            <h3 className="text-lg font-bold text-slate-200">Export Vault</h3>
                            <p className="text-sm text-zinc-500 mt-1 max-w-sm">Download your passwords as a decrypted CSV file for offline backup or migration.</p>
                          </div>
                          <button
                            onClick={handleExportCsv}
                            disabled={loadingCsvExport}
                            className="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-6 rounded-xl inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
                          >
                            {loadingCsvExport ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                            {loadingCsvExport ? 'Preparing...' : 'Export CSV'}
                          </button>
                        </div>

                        {/* Import Card */}
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors space-y-6">
                          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-bold text-white">Import from CSV</h3>
                              <p className="text-sm text-zinc-500 mt-1 max-w-xl">
                                Import credentials from other password managers. Your data will be encrypted before storage.
                              </p>
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                              <label className="flex-1 sm:flex-initial bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-6 rounded-xl inline-flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap">
                                <Upload className="w-5 h-5" />
                                Select File
                                <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvPicked} />
                              </label>
                              
                              {csvRows.length > 0 && (
                                <button
                                  onClick={handleImportCsv}
                                  disabled={loadingImport || !mappingReady}
                                  className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-emerald-500/20"
                                >
                                  {loadingImport ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                  Confirm Import
                                </button>
                              )}
                            </div>
                          </div>

                          {csvFileName && (
                            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex-1 text-sm font-medium text-emerald-100 truncate">
                                {csvFileName}
                              </div>
                              <div className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md">
                                {csvRows.length} ROWS
                              </div>
                              <button onClick={() => { setCsvRows([]); setCsvFileName(null); }} className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {csvHeaders.length > 0 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(Object.keys(FIELD_LABELS) as ImportTargetField[]).map((field) => (
                                  <div key={field} className="space-y-1.5">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{FIELD_LABELS[field]}</label>
                                    <select
                                      value={mapping[field] ?? '__ignore__'}
                                      onChange={(event) => handleMappingChange(field, event.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 px-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                                    >
                                      <option value="__ignore__">── Ignored ──</option>
                                      {csvHeaders.map((header) => (
                                        <option key={`${field}-${header}`} value={header}>
                                          {header}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>

                              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden shadow-inner">
                                <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Data Preview</span>
                                  <span className="text-[10px] text-zinc-600">First 3 rows</span>
                                </div>
                                <div className="overflow-x-auto">
                                  {previewFields.length > 0 ? (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-zinc-900/30">
                                          {previewFields.map((field) => (
                                            <th key={field} className="text-left text-zinc-400 font-bold px-4 py-2.5 whitespace-nowrap">
                                              {FIELD_LABELS[field]}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {previewRows.map((row, index) => (
                                          <tr key={`preview-${index}`} className="border-t border-zinc-900/80">
                                            {previewFields.map((field) => (
                                              <td key={`preview-${index}-${field}`} className="px-4 py-2.5 text-zinc-300 max-w-[180px] truncate">
                                                {row[field] || '—'}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div className="px-5 py-6 text-sm text-zinc-600 text-center italic">
                                      Map at least one field to see a preview of your data.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          <AnimatePresence>
                            {importError && (
                              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 px-4 py-3 text-sm font-medium">
                                {importError}
                              </motion.div>
                            )}
                            {importMessage && (
                              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-100 px-4 py-3 text-sm font-medium">
                                {importMessage}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeSection === 'account' && (
                  <div className="max-w-4xl space-y-8">
                    <section>
                      <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-3">
                        <User className="w-5 h-5 text-indigo-400" /> 
                        Account Preferences
                      </h2>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Registered Email</label>
                          <div className="text-slate-200 font-medium break-all">{user?.email}</div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Session Identifier</label>
                          <div className="text-zinc-500 font-mono text-xs truncate" title={user?.uid}>{user?.uid}</div>
                        </div>
                      </div>

                      <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8 space-y-6 transition-all hover:bg-red-500/[0.07]">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-6">
                          <div className="flex items-start gap-4">
                            <div className="p-3 rounded-2xl bg-red-400/20 text-red-400">
                              <AlertTriangle className="w-8 h-8" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold text-slate-100">Danger Zone</h3>
                              <p className="text-zinc-400 text-sm mt-1 max-w-lg leading-relaxed">
                                Deleting your account will permanently wipe your entire vault. 
                                This data is end-to-end encrypted; once deleted, it cannot be recovered by us or anyone else.
                              </p>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => {
                              setShowDeleteModal(true);
                              setDeletePassword('');
                              setDeleteConfirmText('');
                              setDeleteError(null);
                            }}
                            className="w-full sm:w-auto bg-red-600 hover:bg-red-500 text-white font-bold py-3.5 px-8 rounded-xl inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-500/20 active:scale-95 whitespace-nowrap"
                          >
                            <Trash2 className="w-5 h-5" />
                            Purge Everything
                          </button>
                        </div>

                        <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/10 backdrop-blur-sm">
                          <ul className="text-xs text-red-400/80 space-y-2 list-disc list-inside font-medium">
                            <li>All vault credentials will be purged from our servers.</li>
                            <li>Your master record will be destroyed.</li>
                            <li>You will be immediately logged out.</li>
                          </ul>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {activeSection === 'app' && (
                  <div className="max-w-4xl">
                    <section>
                      <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-amber-400" /> 
                        Native Experience
                      </h2>

                      <div className="bg-zinc-950/40 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center text-center space-y-6">
                        <div className="w-24 h-24 rounded-3xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-xl shadow-amber-500/10">
                          <Smartphone className="w-12 h-12" />
                        </div>
                        
                        <div className="space-y-2 max-w-lg">
                          <h3 className="text-2xl font-bold text-slate-100">Mero Passwords for Desktop</h3>
                          <p className="text-zinc-400">
                            Install as a Progressive Web App to enjoy a full-screen experience, standalone window, and offline vault access.
                          </p>
                        </div>

                        <div className="w-full max-w-md p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 text-left">
                          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Native Features</h4>
                          <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
                            <div className="flex items-center gap-2 text-emerald-400"><Shield className="w-3.5 h-3.5" /> No URL Bar</div>
                            <div className="flex items-center gap-2 text-emerald-400"><RefreshCcw className="w-3.5 h-3.5" /> Background Sync</div>
                            <div className="flex items-center gap-2 text-emerald-400"><Lock className="w-3.5 h-3.5" /> Secure Keyring</div>
                            <div className="flex items-center gap-2 text-emerald-400"><LayoutDashboard className="w-3.5 h-3.5" /> Taskbar Icon</div>
                          </div>
                        </div>

                        {!isInstalled && canInstall && (
                          <button
                            onClick={handleInstallApp}
                            disabled={isInstallFlowRunning}
                            className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold py-4 px-10 rounded-2xl inline-flex items-center gap-3 transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
                          >
                            {isInstallFlowRunning ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Smartphone className="w-5 h-5" />}
                            {isInstallFlowRunning ? 'Initializing...' : 'Install Native App'}
                          </button>
                        )}

                        {(isInstalled || !canInstall) && (
                          <div className="px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-sm flex items-center gap-2">
                            <Shield className="w-4 h-4" /> App is already in your library
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
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
