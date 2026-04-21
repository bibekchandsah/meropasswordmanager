'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Settings, LogOut, ShieldAlert, LayoutDashboard, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { useAutoLock } from '@/hooks/useAutoLock';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useStore();
  const [isClient, setIsClient] = useState(false);
  useAutoLock();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && !user) {
      router.push('/auth');
    }
  }, [isClient, user, router]);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await signOut(auth);
    logout();
    router.push('/auth');
  };

  if (!isClient || !user) return null;

  const userInitial = (user.email?.trim()?.charAt(0) || 'U').toUpperCase();

  return (
    <div className="flex h-screen bg-zinc-950 text-slate-200">
      {/* Desktop Sidebar */}
      <aside
        className={`bg-zinc-900 border-r border-zinc-800 hidden md:flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}
      >
        <div className="p-4">
          <div className={`flex items-center text-emerald-500 font-bold mb-8 ${isSidebarCollapsed ? 'justify-center' : 'justify-between text-xl'}`}>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" />
              {!isSidebarCollapsed ? <span>Mero Passwords </span> : null}
            </div>
            <button
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
          
          <nav className="space-y-2 flex-1">
            <Link
              href="/dashboard"
              className={`flex items-center px-4 py-3 rounded-lg font-medium transition-colors cursor-pointer ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} ${pathname === '/dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
              title="Mero Password Manager"
            >
              <LayoutDashboard className="w-5 h-5" />
              {!isSidebarCollapsed ? 'Mero Passwords' : null}
            </Link>
            <Link
              href="/dashboard/settings"
              className={`flex items-center px-4 py-3 rounded-lg transition-colors cursor-pointer ${isSidebarCollapsed ? 'justify-center' : 'gap-3'} ${pathname.startsWith('/dashboard/settings') ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
              {!isSidebarCollapsed ? 'Settings' : null}
            </Link>
          </nav>
        </div>
        
        <div className={`mt-auto p-4 border-t border-zinc-800 ${isSidebarCollapsed ? 'space-y-2' : 'space-y-4'}`}>
          {isSidebarCollapsed ? (
            <div className="flex justify-center">
              <ThemeToggle iconOnly />
            </div>
          ) : (
            <ThemeToggle className="w-full" />
          )}
          {!isSidebarCollapsed ? (
            <div className="flex items-center gap-2 px-2">
              <div className="h-8 w-8 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-semibold" title="Profile">
                    {userInitial}
                  </span>
                )}
              </div>
              <div className="text-sm font-medium text-zinc-400 truncate">{user.email}</div>
            </div>
          ) : null}
          {isSidebarCollapsed ? (
            <div className="flex justify-center" title={user.email}>
              <div className="h-8 w-8 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-semibold" title="Profile">
                    {userInitial}
                  </span>
                )}
              </div>
            </div>
          ) : null}
          <button 
            onClick={handleLogout}
            className={`flex items-center px-4 py-2 w-full text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}
            title="Lock & Logout"
          >
            <LogOut className="w-5 h-5" />
            {!isSidebarCollapsed ? 'Lock & Logout' : null}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${isMobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          className="absolute inset-0 bg-black/50 cursor-pointer"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
        <aside
          className={`absolute left-0 top-0 h-full w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-300 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-500 font-bold text-xl">
              <ShieldAlert className="w-6 h-6" />
              <span>Mero Password Manager</span>
            </div>
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="p-4 space-y-2 flex-1">
            <Link
              href="/dashboard"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors cursor-pointer ${pathname === '/dashboard' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              Mero Password Manager
            </Link>
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer ${pathname.startsWith('/dashboard/settings') ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
            >
              <Settings className="w-5 h-5" />
              Settings
            </Link>
          </nav>

          <div className="p-4 border-t border-zinc-800 space-y-4">
            <ThemeToggle className="w-full" />
            <div className="flex items-center gap-2 px-2">
              <div className="h-8 w-8 overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 flex items-center justify-center text-zinc-300 shrink-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs font-semibold" title="Profile">
                    {userInitial}
                  </span>
                )}
              </div>
              <div className="text-sm font-medium text-zinc-400 truncate">{user.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 w-full text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              Lock & Logout
            </button>
          </div>
        </aside>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-950">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-emerald-500 font-bold text-lg">
            <ShieldAlert className="w-5 h-5" />
            <span>Mero Password Manager</span>
          </div>
          <button onClick={handleLogout} className="text-zinc-400 cursor-pointer">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 md:p-8 max-w-7xl mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
