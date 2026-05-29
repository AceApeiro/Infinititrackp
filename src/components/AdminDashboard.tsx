import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PatrolLocation } from '../utils';

interface Props {
  locations: PatrolLocation[];
  forcedLocation?: string;
}

export default function AdminDashboard({ locations, forcedLocation }: Props) {
  const [selectedMainLocation, setSelectedMainLocation] = useState<string>('');

  const isLocked = !!forcedLocation;
  const activeFilterLocation = isLocked ? forcedLocation : selectedMainLocation;

  const uniqueMainLocations = Array.from(new Set(locations.map(l => l.clientLocation))).filter(Boolean);

  const filteredLocations = activeFilterLocation 
    ? locations.filter(l => l.clientLocation.toLowerCase().trim() === activeFilterLocation.toLowerCase().trim())
    : locations;

  return (
    <div className="w-full h-full flex flex-col bg-black">
      <div className="p-4 md:p-6 bg-zinc-900/50 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex items-end gap-4">
          <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-none opacity-20">
            {isLocked ? "02" : "01"}
          </h2>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-[#FBDF07]">
              {isLocked ? "My QR Codes" : "Dispatch Admin"}
            </span>
            <span className="text-sm font-bold text-white uppercase mt-1">
              {isLocked ? `Assigned Location: ${forcedLocation}` : "Manage Sub Locations & QR"}
            </span>
          </div>
        </div>
        <div className="w-full md:w-auto">
          {isLocked ? (
            <div className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/80 px-4 py-3 uppercase tracking-widest font-mono">
              ★ Active Whitelist Link
            </div>
          ) : (
            <select 
              className="w-full md:w-64 bg-black border border-zinc-700 rounded-none p-3 text-white text-xs font-bold uppercase tracking-wider focus:border-[#FBDF07] focus:outline-none"
              value={selectedMainLocation}
              onChange={(e) => setSelectedMainLocation(e.target.value)}
            >
              <option value="">ALL LOCATIONS</option>
              {uniqueMainLocations.map(ml => (
                <option key={ml} value={ml}>{ml}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 bg-zinc-950">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 w-full">
          {filteredLocations.map((loc, idx) => {
            // Construct the payload for the QR code
            const qrPayload = JSON.stringify({
              c: loc.clientLocation,
              s: loc.subLocation,
              g: loc.geocode
            });

            return (
              <div key={idx} className="bg-zinc-900 border border-zinc-800 flex flex-col group relative overflow-hidden">
                <div className="bg-[#FBDF07] opacity-0 group-hover:opacity-100 absolute top-0 left-0 w-full h-1 transition-opacity"></div>
                <div className="p-6 flex flex-col items-center border-b border-zinc-800 bg-black min-h-[220px] justify-center">
                  <div className="bg-white p-3 rounded-none shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-transform group-hover:scale-105">
                    <QRCodeSVG value={qrPayload} size={140} level="M" />
                  </div>
                </div>
                
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider" title={loc.subLocation}>{loc.subLocation}</h3>
                    <p className="text-[10px] font-bold text-[#FBDF07] uppercase tracking-widest mt-1" title={loc.clientLocation}>{loc.clientLocation}</p>
                    {loc.geocode && <p className="text-[9px] font-mono text-zinc-500 mt-2">Geo: {loc.geocode}</p>}
                  </div>
                  
                  <div className="text-[10px] font-bold bg-black p-3 border-l-2 border-zinc-700 w-full">
                    <p className="mb-2 text-zinc-500 uppercase tracking-widest text-[9px]">Required Scans:</p>
                    <div className="flex flex-wrap gap-2">
                      {loc.timeToScan.length > 0 ? (
                        loc.timeToScan.map((t, i) => (
                          <span key={i} className="bg-zinc-800 text-zinc-300 px-2 py-1 uppercase">{t}</span>
                        ))
                      ) : (
                        <span className="text-zinc-600 italic uppercase">Anytime</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
