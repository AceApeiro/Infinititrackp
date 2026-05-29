import React, { useEffect, useState } from 'react';
import { Trash2, Download, RefreshCw, FileSpreadsheet } from 'lucide-react';

export default function SummaryReport() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  
  const [selectedMainLocation, setSelectedMainLocation] = useState<string>('');
  const [selectedSubLocation, setSelectedSubLocation] = useState<string>('');

  const fetchLogs = async () => {
    try {
      const { fetchSummaryLogs } = await import('../api');
      const data = await fetchSummaryLogs();
      setLogs(data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  useEffect(() => {
    fetchLogs().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const handleClearRecords = async () => {
    if (!window.confirm("ARE YOU SURE YOU WANT TO CLEAR ALL RECENT RECORDS? THIS ACTION WILL WIPE ALL PERSISTED DISPATCH LOGS FROM THE TEMPORARY SERVER CACHE BACKUP.")) {
      return;
    }
    
    setClearing(true);
    try {
      const response = await fetch('/api/sheets/clear', {
        method: 'POST'
      });
      if (response.ok) {
        // Reset to initial header template
        setLogs([['TIMESTAMP', 'CSO', 'CSO NAME', 'MAIN LOCATION', 'SUB LOCATION', 'COMPLETED AMOUNT', 'GEOCODE COMPLIANCE', 'PROOF IMAGE']]);
        alert("RECORDS SUCCESSFULLY ERASED FROM THE DISPATCH DATABASE BACKUP.");
      } else {
        alert("Action failed. Server rejects or is currently unreachable.");
      }
    } catch (error: any) {
      console.error(error);
      alert("Error invoking wipe controller: " + (error.message || String(error)));
    } finally {
      setClearing(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      alert("No data available to export.");
      return;
    }

    const contentRows = [headers, ...filteredRows];
    const csvContent = contentRows.map(row => 
      row.map((val: any) => {
        const text = val === null || val === undefined ? '' : String(val);
        // Escape quotes and wrap cell in double quotes
        return `"${text.replace(/"/g, '""')}"`;
      }).join(",")
    ).join("\r\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute('download', `patrol_export_database_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="text-[#FBDF07] font-mono p-8 text-center animate-pulse tracking-widest uppercase">Fetching Logs...</div>;
  }

  const headers = logs.length > 0 ? logs[0] : ['TIMESTAMP', 'CSO', 'CSO NAME', 'MAIN LOCATION', 'SUB LOCATION', 'COMPLETED AMOUNT', 'GEOCODE COMPLIANCE', 'PROOF IMAGE'];
  
  const completedAmountIdx = headers.findIndex((h: string) => h && h.toUpperCase().includes('COMPLETED AMOUNT')) !== -1 
    ? headers.findIndex((h: string) => h && h.toUpperCase().includes('COMPLETED AMOUNT')) 
    : 5;
    
  // Exclude tickets and empty/null/undefined rows from standard patrol analytics
  const rawRows = logs.length > 0 ? logs.slice(1) : [];
  const rows = rawRows.filter(row => {
    const val = row[completedAmountIdx];
    return !(val && typeof val === 'string' && val.toUpperCase().startsWith('TICKET'));
  });

  // Extract unique locations for filtering
  // Main Location is usually index 3 & Sub Location is index 4
  const mainLocIdx = headers.findIndex((h: string) => h && h.toUpperCase().includes('MAIN LOCATION')) !== -1 
    ? headers.findIndex((h: string) => h && h.toUpperCase().includes('MAIN LOCATION')) 
    : 3;
    
  const subLocIdx = headers.findIndex((h: string) => h && h.toUpperCase().includes('SUB LOCATION')) !== -1 
    ? headers.findIndex((h: string) => h && h.toUpperCase().includes('SUB LOCATION')) 
    : 4;

  const uniqueMainLocs = Array.from(new Set(rows.map(r => r[mainLocIdx]))).filter(Boolean);
  const uniqueSubLocs = Array.from(new Set(rows.map(r => r[subLocIdx]))).filter(Boolean);

  let filteredRows = rows;
  if (selectedMainLocation) {
    filteredRows = filteredRows.filter(r => r[mainLocIdx] === selectedMainLocation);
  }
  if (selectedSubLocation) {
    filteredRows = filteredRows.filter(r => r[subLocIdx] === selectedSubLocation);
  }

  return (
    <div className="w-full flex-1 flex flex-col bg-black pb-8">
      {/* Top Header */}
      <div className="p-4 md:p-6 bg-zinc-900/50 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex items-end gap-4">
          <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-none opacity-20">03</h2>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-[#FBDF07]">Analytics</span>
            <span className="text-sm font-bold text-white uppercase mt-1">Patrol Log Summary</span>
          </div>
        </div>

        {/* Master Control Panel */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto self-stretch md:self-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-[10px] uppercase tracking-wider px-4 py-2.5 border border-zinc-800 transition-colors"
            title="Reload from server database"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-[#FBDF07]" : ""} />
            {refreshing ? "SYNCING..." : "REFRESH"}
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-[#FBDF07] hover:bg-white text-black font-black text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors"
            title="Export database rows directly to Excel compatible CSV file"
          >
            <FileSpreadsheet size={13} />
            EXPORT TO EXCEL
          </button>

          <button
            type="button"
            onClick={handleClearRecords}
            disabled={clearing}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1 bg-red-950/40 hover:bg-red-900 border border-red-900 text-red-100 font-bold text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors"
            title="Wipe database logs backup"
          >
            <Trash2 size={13} className={clearing ? "animate-bounce" : ""} />
            CLEAR BACKUP
          </button>
        </div>
      </div>

      {/* Select Filter Row */}
      <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 bg-zinc-950 border-b border-zinc-800">
        <select 
          className="w-full md:w-64 bg-black border border-zinc-700 rounded-none p-3 text-white text-xs font-bold uppercase tracking-wider focus:border-[#FBDF07] focus:outline-none"
          value={selectedMainLocation}
          onChange={(e) => {
            setSelectedMainLocation(e.target.value);
            setSelectedSubLocation('');
          }}
        >
          <option value="">ALL MAIN LOCATIONS</option>
          {uniqueMainLocs.map(ml => (
            <option key={ml as string} value={ml as string}>{ml as string}</option>
          ))}
        </select>
        
        <select 
          className="w-full md:w-64 bg-black border border-zinc-700 rounded-none p-3 text-white text-xs font-bold uppercase tracking-wider focus:border-[#FBDF07] focus:outline-none"
          value={selectedSubLocation}
          onChange={(e) => setSelectedSubLocation(e.target.value)}
        >
          <option value="">ALL SUB LOCATIONS</option>
          {uniqueSubLocs.map(sl => (
            <option key={sl as string} value={sl as string}>{sl as string}</option>
          ))}
        </select>
      </div>

      {/* Main Results Table Content */}
      <div className="w-full bg-zinc-900 border border-zinc-800 flex flex-col flex-1 mt-6">
         <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center">
           <h3 className="text-[#FBDF07] font-black tracking-widest uppercase text-xs">Filtered Results</h3>
           <span className="text-xs text-zinc-400 uppercase tracking-widest font-bold bg-black px-3 py-1 border border-zinc-800">{filteredRows.length} Entries</span>
         </div>
         
         <div className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-black text-zinc-500 uppercase tracking-widest sticky top-0 shadow-md">
                <tr>
                  {headers.map((header: string, i: number) => (
                    <th key={i} className="p-4 border-b border-zinc-800 font-black">{header || `Header ${i}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-zinc-300 font-mono">
                {filteredRows.slice().reverse().map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800 transition-colors">
                    {row.map((cell: any, j: number) => {
                      let cellClass = "p-4";
                      const cellStr = cell ? String(cell) : '';
                      
                      if (cellStr === 'ON TIME') cellClass += " text-green-500 font-bold bg-green-900/10";
                      if (cellStr.includes('LATE') || cellStr.includes('DELAYED')) cellClass += " text-red-500 font-bold bg-red-900/10";
                      
                      if (cellStr && cellStr.startsWith && cellStr.startsWith('http')) {
                         return (
                           <td key={j} className={cellClass}>
                             <a href={cellStr} target="_blank" rel="noreferrer" className="text-[#FBDF07] font-bold underline hover:text-white transition-colors">View Link</a>
                           </td>
                         );
                      }
                      return (
                        <td key={j} className={cellClass}>
                          {cellStr}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={headers.length} className="p-8 text-center text-zinc-600 italic uppercase">No matching logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
