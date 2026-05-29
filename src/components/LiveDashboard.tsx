import React, { useState, useEffect } from 'react';
import { PatrolLocation } from '../utils';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { fetchSummaryLogs } from '../api';

// Custom icons
const highlightIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const defaultIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const activeIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface Props {
  locations: PatrolLocation[];
}

export default function LiveDashboard({ locations }: Props) {
  const uniqueMainLocs = Array.from(new Set(locations.map(l => l.clientLocation))).filter(Boolean);
  const [selectedLocation, setSelectedLocation] = useState<PatrolLocation | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchSummaryLogs().then(setLogs).catch(console.error);
    const interval = setInterval(() => {
      fetchSummaryLogs().then(setLogs).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Group locations by their valid geocode to center the map properly
  const mappedLocations = locations
    .filter(l => l.geocode && l.geocode.includes(','))
    .map(l => {
      const [lat, lng] = l.geocode.split(',').map(coord => parseFloat(coord.trim()));
      
      // Check logs to see if recently scanned (last 24 hours for example)
      let lastScanned = null;
      let lastScannedRow: string[] | null = null;
      let isRecentlyScanned = false;
      const headers = logs[0] || [];
      const subLocIdx = headers.findIndex((h: string) => h.toUpperCase().includes('SUB LOCATION')) !== -1 ? headers.findIndex((h: string) => h.toUpperCase().includes('SUB LOCATION')) : 4;
      const timeIdx = headers.findIndex((h: string) => h.toUpperCase().includes('TIMESTAMP')) !== -1 ? headers.findIndex((h: string) => h.toUpperCase().includes('TIMESTAMP')) : 0;
      const completedAmountIdx = headers.findIndex((h: string) => h.toUpperCase().includes('COMPLETED AMOUNT')) !== -1 ? headers.findIndex((h: string) => h.toUpperCase().includes('COMPLETED AMOUNT')) : 5;
      
      for (let i = logs.length - 1; i >= 1; i--) {
        const row = logs[i];
        if (!row) continue;
        const compVal = row[completedAmountIdx];
        if (compVal && typeof compVal === 'string' && compVal.toUpperCase().startsWith('TICKET')) {
          continue; // Ignore tickets for patrol scans
        }
        if (row[subLocIdx] === l.subLocation) {
          lastScanned = row[timeIdx];
          lastScannedRow = row;
          isRecentlyScanned = true; // Mark as scanned if it exists in logs at all
          break;
        }
      }
      
      return { ...l, lat, lng, lastScanned, isRecentlyScanned, lastScannedRow, headers };
    })
    .filter(l => !isNaN(l.lat) && !isNaN(l.lng));

  const center: [number, number] = mappedLocations.length > 0 
    ? [mappedLocations[0].lat, mappedLocations[0].lng] 
    : [6.883, 79.865];

  return (
    <div className="w-full h-full flex flex-col gap-6 bg-black pb-8">
       {/* Top Row: Left Locations, Right Map */}
       <div className="flex flex-col lg:flex-row gap-6 h-full flex-1 min-h-[500px]">
          {/* Left Locations */}
          <div className="w-full lg:w-1/3 bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-zinc-800 bg-zinc-950">
               <h3 className="text-[#FBDF07] font-black tracking-widest uppercase">Monitored Locations</h3>
             </div>
             <div className="p-4 overflow-y-auto flex-1 space-y-4">
               {uniqueMainLocs.map(ml => {
                 const subs = locations.filter(l => l.clientLocation === ml);
                 return (
                   <div key={ml} className="space-y-2">
                     <h4 className="text-white font-bold uppercase tracking-wider text-sm">{ml}</h4>
                     <div className="ml-4 space-y-2">
                       {subs.map(s => {
                          let subLastScanned = null;
                          const headers = logs[0] || [];
                          const subLocIdx = headers.findIndex((h: string) => h.toUpperCase().includes('SUB LOCATION')) !== -1 ? headers.findIndex((h: string) => h.toUpperCase().includes('SUB LOCATION')) : 4;
                          const timeIdx = headers.findIndex((h: string) => h.toUpperCase().includes('TIMESTAMP')) !== -1 ? headers.findIndex((h: string) => h.toUpperCase().includes('TIMESTAMP')) : 0;
                          
                          const completedAmountIdx = headers.findIndex((h: string) => h.toUpperCase().includes('COMPLETED AMOUNT')) !== -1 ? headers.findIndex((h: string) => h.toUpperCase().includes('COMPLETED AMOUNT')) : 5;
                           for (let i = logs.length - 1; i >= 1; i--) {
                             const row = logs[i];
                             if (!row) continue;
                             const compVal = row[completedAmountIdx];
                             if (compVal && typeof compVal === 'string' && compVal.toUpperCase().startsWith('TICKET')) {
                               continue; // Ignore tickets for patrol scans
                             }
                             if (row[subLocIdx] === s.subLocation) {
                               subLastScanned = row[timeIdx];
                               break;
                             }
                           }
                          
                         return (
                         <div key={s.subLocation} className={`text-xs ${subLastScanned ? 'text-green-400' : 'text-zinc-400'} font-mono flex items-center justify-between border-b border-zinc-800/50 pb-2`}>
                           <div className="flex flex-col">
                             <span>{s.subLocation}</span>
                             {subLastScanned && <span className="text-[9px] text-green-600 mt-1">{subLastScanned}</span>}
                           </div>
                           <span className="text-[9px] bg-zinc-800 px-2 py-1 uppercase rounded text-[#FBDF07]">{s.timeToScan.length > 0 ? s.timeToScan.length + ' Checks' : '24/7'}</span>
                         </div>
                         );
                        })}
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
          
          {/* Right Map */}
          <div className="w-full lg:w-2/3 border border-zinc-800 relative bg-zinc-950 overflow-hidden min-h-[500px] z-0">
             <MapContainer
                center={center}
                zoom={14}
                style={{ height: '100%', width: '100%', backgroundColor: '#000' }}
                zoomControl={false}
             >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                
                {mappedLocations.map((loc, idx) => {
                  const isSelected = selectedLocation?.subLocation === loc.subLocation;
                  let icon = defaultIcon;
                  if (isSelected) {
                    icon = highlightIcon;
                  } else if (loc.isRecentlyScanned) {
                    icon = activeIcon;
                  }

                  return (
                    <Marker 
                      key={idx} 
                      position={[loc.lat, loc.lng]}
                      icon={icon}
                      eventHandlers={{
                        click: () => setSelectedLocation(loc as any),
                      }}
                    >
                      <Popup className="tactical-popup">
                         <div className="bg-black border border-[#FBDF07] p-3 text-xs text-white min-w-[200px] shadow-[0_0_20px_rgba(251,223,7,0.2)]">
                           <div className="font-black text-[#FBDF07] uppercase text-sm border-b border-zinc-800 pb-1 mb-2">QR: {loc.subLocation}</div>
                           <div className="font-mono text-[9px] text-zinc-400">LAT/LNG: {loc.geocode}</div>
                           <div className="font-mono text-[10px] text-zinc-300 mt-1 pb-2 border-b border-zinc-800">SITE: {loc.clientLocation}</div>
                           
                           {loc.lastScannedRow ? (
                             <div className="mt-2 space-y-1">
                               <div className="text-[10px] text-green-400 font-mono font-bold">
                                 LATEST SCAN DETAILS
                               </div>
                               <div className="text-[10px] text-zinc-300 font-mono grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 mt-1">
                                  <span className="text-zinc-500 uppercase">Time:</span>
                                  <span>{loc.lastScanned}</span>
                                  
                                  <span className="text-zinc-500 uppercase">Timing:</span>
                                  <span className={loc.lastScannedRow[5]?.startsWith('ON TIME') ? 'text-green-400' : 'text-[#FBDF07]'}>
                                    {loc.lastScannedRow[5] || 'N/A'}
                                  </span>

                                  <span className="text-zinc-500 uppercase">CSO:</span>
                                  <span>{loc.lastScannedRow[1] || ''} - {loc.lastScannedRow[2] || ''}</span>
                                  
                                  <span className="text-zinc-500 uppercase">GPS Geo:</span>
                                  <span className={loc.lastScannedRow[6]?.includes('COMPLIANT') ? 'text-green-400' : 'text-red-400'}>
                                    {loc.lastScannedRow[6] || 'N/A'}
                                  </span>
                                  
                                  {loc.lastScannedRow[7] && (
                                    <>
                                      <span className="text-zinc-500 uppercase">Photo:</span>
                                      <a href={loc.lastScannedRow[7]} target="_blank" rel="noreferrer" className="text-[#FBDF07] hover:underline font-bold uppercase text-[9px]">
                                        View Proof Photo
                                      </a>
                                    </>
                                  )}
                                </div>
                             </div>
                           ) : (
                             <div className="mt-2 text-[10px] text-red-500 font-mono animate-pulse">
                               &gt; NO SCAN RECORDS FOUND
                             </div>
                           )}
                         </div>
                      </Popup>
                    </Marker>
                  );
                })}
             </MapContainer>
             
             <div className="absolute top-4 left-4 pointer-events-none z-[1000]">
               <div className="bg-black/90 px-4 py-3 border border-zinc-800 backdrop-blur-md">
                 <h3 className="text-[#FBDF07] font-black tracking-widest text-xs uppercase">Tactical Map Feed</h3>
                 <p className="text-[10px] text-green-500 font-mono mt-1 flex items-center gap-2 uppercase tracking-widest">
                   <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> SAT-LINK ACTIVE (OSM)
                 </p>
               </div>
             </div>
          </div>
       </div>
    </div>
  );
}
