import React, { useState } from 'react';
import { Guard } from '../utils';
import MatrixRain from './MatrixRain';

interface Props {
  guards: Guard[];
  onLogin: (guard: Guard) => void;
}

export default function LoginScreen({ guards, onLogin }: Props) {
  const [uid, setUid] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const guard = guards.find(g => 
      g.uid.toLowerCase() === uid.toLowerCase().trim() && 
      (g.password || '').toLowerCase() === password.toLowerCase().trim()
    );
    
    if (guard) {
      onLogin(guard);
    } else {
      setError('Invalid UID or Password');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-sans p-6 relative overflow-hidden">
      <MatrixRain color="#FBDF07" opacity={0.12} />
      
      {/* Absolute Header Ticker on Login Screen */}
      <div className="absolute top-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-sm border-b border-zinc-900 py-2.5 overflow-hidden select-none flex z-10">
        <div className="animate-ticker flex shrink-0 gap-16 min-w-full justify-around pr-16 items-center text-[#FBDF07] font-mono text-[9px] uppercase font-black tracking-widest">
          <span>★ DEVELOPED AND POWERED BY INFINITI</span>
          <span className="text-zinc-700">•</span>
          <span>X GUARD - PATROL TRACKER SYSTEM CONTROL</span>
          <span className="text-zinc-700">•</span>
          <span>ENTER CREDENTIALS TO LOG SITEREP</span>
          <span className="text-zinc-700">•</span>
        </div>
        <div className="animate-ticker flex shrink-0 gap-16 min-w-full justify-around pr-16 items-center text-[#FBDF07] font-mono text-[9px] uppercase font-black tracking-widest" aria-hidden="true">
          <span>★ DEVELOPED AND POWERED BY INFINITI</span>
          <span className="text-zinc-700">•</span>
          <span>X GUARD - PATROL TRACKER SYSTEM CONTROL</span>
          <span className="text-zinc-700">•</span>
          <span>ENTER CREDENTIALS TO LOG SITEREP</span>
          <span className="text-zinc-700">•</span>
        </div>
      </div>

      <div className="mb-8 flex flex-col items-center gap-4 mt-12 relative z-10">
        <img src="https://imgur.com/qMyDS4j.png" alt="X GUARD Logo" className="h-24 object-contain" />
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-center leading-none text-[#FBDF07]">X GUARD - <span className="text-white">PATROL TRACKER</span></h1>
      </div>
      
      <div className="max-w-md w-full bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 p-8 shadow-2xl space-y-6 relative z-10">
        <div className="text-center border-b border-zinc-800 pb-4">
          <h2 className="text-xl font-black tracking-widest text-[#FBDF07] uppercase">System Login</h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-1 font-bold">Enter operative credentials</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && <div className="bg-red-900/30 border-l-4 border-red-500 text-red-400 text-xs font-bold p-3 uppercase tracking-wider">{error}</div>}
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">UID</label>
            <input 
              type="text" 
              value={uid}
              onChange={e => setUid(e.target.value)}
              className="w-full bg-black border border-zinc-800 p-4 text-white focus:outline-none focus:border-[#FBDF07] transition-colors font-mono"
              placeholder="e.g. xg591"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-black border border-zinc-800 p-4 text-white focus:outline-none focus:border-[#FBDF07] transition-colors font-mono"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-[#FBDF07] hover:bg-white text-black font-black text-xs uppercase tracking-[0.2em] py-4 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            Access System
          </button>
        </form>

        <div className="text-center text-[10px] uppercase tracking-widest font-bold text-zinc-600 pt-4 border-t border-zinc-800">
          Authorized personnel only. Activities are monitored.
        </div>
      </div>
    </div>
  );
}
