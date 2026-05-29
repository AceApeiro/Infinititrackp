import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate, NavLink } from 'react-router-dom';
import { fetchGuards, Guard, PatrolLocation, fetchLocations } from './utils';

import { ShieldCheck, MapPin, QrCode, ClipboardList, LogOut } from 'lucide-react';

import PatrolScanner from './components/PatrolScanner';
import AdminDashboard from './components/AdminDashboard';
import LiveDashboard from './components/LiveDashboard';
import SummaryReport from './components/SummaryReport';
import LoginScreen from './components/LoginScreen';
import TicketManager from './components/TicketManager';
import MatrixRain from './components/MatrixRain';

// Helper to determine if logged-in operative has full Admin/CSO credentials
export const isAdmin = (guard: Guard | null): boolean => {
  if (!guard) return false;
  const uid = guard.uid.toLowerCase();
  const rank = (guard.rank || '').toLowerCase();
  return uid.startsWith('admin') || uid.startsWith('cso') || rank === 'cso' || rank === 'admin' || uid === 'xg324';
};

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // App domain state
  const [guards, setGuards] = useState<Guard[]>([]);
  const [locations, setLocations] = useState<PatrolLocation[]>([]);
  const [activeGuard, setActiveGuard] = useState<Guard | null>(null);

  useEffect(() => {
    Promise.all([fetchGuards(), fetchLocations()])
      .then(([g, l]) => {
        setGuards(g);
        setLocations(l);
        
        // Auto-restore logged-in guard session from localStorage if it exists and matches
        const savedUid = localStorage.getItem('X_GUARD_ACTIVE_UID');
        if (savedUid) {
          const found = g.find(guard => guard.uid.toLowerCase() === savedUid.toLowerCase());
          if (found) {
            setActiveGuard(found);
          }
        }
        setIsInitializing(false);
      })
      .catch((err) => {
        console.error(err);
        setInitError(err?.message || String(err));
        setIsInitializing(false);
      });
  }, []);

  const handleGuardLogin = (guard: Guard) => {
    setActiveGuard(guard);
    localStorage.setItem('X_GUARD_ACTIVE_UID', guard.uid);
  };

  return (
    <BrowserRouter>
      {isInitializing ? (
        <div className="min-h-screen bg-black text-yellow-400 flex items-center justify-center font-mono">Initializing...</div>
      ) : initError ? (
        <div className="min-h-screen bg-black text-red-500 flex flex-col items-center justify-center font-mono text-center p-8">
          <div className="border border-red-500 p-4">
            <h2 className="text-xl font-black mb-2">INITIALIZATION ERROR</h2>
            <p>{initError}</p>
          </div>
        </div>
      ) : !activeGuard ? (
        <LoginScreen guards={guards} onLogin={handleGuardLogin} />
      ) : (
        <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans overflow-x-hidden relative">
          <MatrixRain color="#FBDF07" opacity={0.06} />
          <header className="h-20 border-b border-zinc-800 flex items-center justify-between px-4 md:px-8 bg-zinc-900/90 backdrop-blur-sm sticky top-0 z-10 w-full font-sans">
            <div className="flex items-center gap-4">
              <img src="https://imgur.com/qMyDS4j.png" alt="X GUARD Logo" className="h-10 md:h-12 object-contain" />
              <div>
                <h1 className="text-xl md:text-3xl font-black tracking-tighter leading-none text-[#FBDF07]">X GUARD - <span className="text-white flex-col md:inline">PATROL TRACKER</span></h1>
                <p className="hidden md:block text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500 mt-1">SITEREP - Central Dispatch Real-Time Monitor</p>
              </div>
            </div>
            <div className="flex gap-4 md:gap-8 text-right">
              <div className="flex flex-col items-end justify-center">
                <span className="text-sm font-bold text-white uppercase">{activeGuard.name}</span>
                <span className="text-[10px] text-zinc-400 tracking-widest uppercase">{activeGuard.rank} • {activeGuard.uid}</span>
              </div>
            </div>
          </header>

          {/* Infinite Scrolling Ticker */}
          <div className="bg-zinc-950 border-b border-zinc-800 py-2.5 overflow-hidden select-none flex">
            <div className="animate-ticker flex shrink-0 gap-16 min-w-full justify-around pr-16 items-center text-white font-mono text-[10px] uppercase font-black tracking-widest">
              <span className="flex items-center gap-2">★ DEVELOPED AND POWERED BY INFINITI</span>
              <span className="text-zinc-600">•</span>
              <span>X GUARD - PATROL TRACKER ACTIVE</span>
              <span className="text-zinc-605">•</span>
              <span>SITEREP DESPATCH ENCRYPTED CONNECTIVITY</span>
              <span className="text-zinc-650">•</span>
            </div>
            <div className="animate-ticker flex shrink-0 gap-16 min-w-full justify-around pr-16 items-center text-white font-mono text-[10px] uppercase font-black tracking-widest" aria-hidden="true">
              <span className="flex items-center gap-2">★ DEVELOPED AND POWERED BY INFINITI</span>
              <span className="text-zinc-600">•</span>
              <span>X GUARD - PATROL TRACKER ACTIVE</span>
              <span className="text-zinc-600">•</span>
              <span>SITEREP DESPATCH ENCRYPTED CONNECTIVITY</span>
              <span className="text-zinc-600">•</span>
            </div>
          </div>

          <main className="flex-1 w-full max-w-[1400px] mx-auto p-4 md:p-8 flex flex-col items-center relative z-10">
            {isAdmin(activeGuard) && (
              <div className="w-full flex flex-wrap gap-4 md:gap-8 border-b border-zinc-805 pb-4 mb-6">
                 <NavLink to="/scan" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                   Patrol Scanner
                 </NavLink>
                 <NavLink to="/admin/dispatch" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                   Live Dispatch
                 </NavLink>
                 <NavLink to="/admin/qr" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                   QR Manager
                 </NavLink>
                 <NavLink to="/admin/analytics" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                   Patrol Logs
                 </NavLink>
                 <NavLink to="/admin/tickets" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                   Ticket Manager
                 </NavLink>
              </div>
            )}
            {!isAdmin(activeGuard) && (
              <div className="w-full flex gap-4 md:gap-8 border-b border-zinc-800 pb-4 mb-6">
                 <NavLink to="/scan" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                   Patrol Scanner
                 </NavLink>
                 {activeGuard.location && activeGuard.location.trim() && (
                   <NavLink to="/qr-view" className={({isActive}) => `text-xs font-black tracking-widest uppercase pb-2 border-b-2 transition-colors ${isActive ? "border-[#FBDF07] text-[#FBDF07]" : "border-transparent text-zinc-500 hover:text-white"}`}>
                     View QR Codes
                   </NavLink>
                 )}
              </div>
            )}
            <Routes>
              {isAdmin(activeGuard) ? (
                <>
                  <Route path="/" element={<Navigate to="/admin/dispatch" replace />} />
                  <Route path="/scan" element={<PatrolScanner activeGuard={activeGuard} locations={locations} />} />
                  <Route path="/admin" element={<Navigate to="/admin/dispatch" replace />} />
                  <Route path="/admin/dispatch" element={<LiveDashboard locations={locations} />} />
                  <Route path="/admin/qr" element={<AdminDashboard locations={locations} />} />
                  <Route path="/admin/analytics" element={<SummaryReport />} />
                  <Route path="/admin/tickets" element={<TicketManager />} />
                </>
              ) : (
                <>
                   <Route path="/" element={<Navigate to="/scan" replace />} />
                   <Route path="/scan" element={<PatrolScanner activeGuard={activeGuard} locations={locations} />} />
                   {activeGuard.location && activeGuard.location.trim() && (
                     <Route path="/qr-view" element={<AdminDashboard locations={locations} forcedLocation={activeGuard.location} />} />
                   )}
                </>
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          <footer className="min-h-12 border-t border-zinc-800 bg-[#FBDF07] text-black px-4 md:px-8 py-3 flex flex-wrap gap-4 justify-between items-center w-full">
            <div className="flex flex-wrap gap-4 md:gap-6 items-center w-full sm:w-auto justify-between sm:justify-start">
              <span className="text-[10px] font-black uppercase tracking-tighter">&copy; {new Date().getFullYear()} X GUARD</span>
              <button 
                onClick={() => {
                  setActiveGuard(null);
                  localStorage.removeItem('X_GUARD_ACTIVE_UID');
                  window.history.pushState(null, '', '/');
                }}
                className="flex items-center gap-2 hover:bg-white hover:text-black hover:border-black border border-transparent px-2 py-1 rounded transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </footer>
        </div>
      )}
    </BrowserRouter>
  );
}
