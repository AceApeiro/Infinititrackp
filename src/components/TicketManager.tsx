import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Send, MessageSquare, Search, Filter, ExternalLink, ShieldAlert } from 'lucide-react';

interface TicketMeta {
  status: 'Pending' | 'Completed';
  comment: string;
  updatedBy: string;
  updatedAt: string;
}

interface TicketItem {
  id: string; // timestamp + "_" + subLocation
  timestamp: string;
  csoUid: string;
  csoName: string;
  mainLocation: string;
  subLocation: string;
  category: string; // TICKET: Damaged etc.
  geoCompliance: string;
  proofImage: string;
  status: 'Pending' | 'Completed';
  comment: string;
  updatedBy?: string;
  updatedAt?: string;
}

export default function TicketManager() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('Pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selected ticket for editing
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localGuardName, setLocalGuardName] = useState('Admin CSO');

  const fetchTicketsData = async () => {
    try {
      // 1. Fetch raw patrol logs
      const { fetchSummaryLogs } = await import('../api');
      const allLogs = await fetchSummaryLogs();
      if (!allLogs || allLogs.length === 0) {
        setTickets([]);
        return;
      }

      const headers = allLogs[0];
      const rows = allLogs.slice(1);

      // Indexes based on headers (or defaults)
      const timestampIdx = 0;
      const csoIdx = 1;
      const csoNameIdx = 2;
      const mainLocIdx = 3;
      const subLocIdx = 4;
      const completedAmountIdx = 5;
      const geoCodeIdx = 6;
      const proofImageIdx = 7;

      // Filter only tickets (where completedAmount / completedAmountIdx starts with 'TICKET:')
      const rawTickets = rows.filter(row => {
        const val = row[completedAmountIdx];
        return val && typeof val === 'string' && val.toUpperCase().startsWith('TICKET:');
      });

      // 2. Fetch ticket status overriding metadata from backend
      const metaRes = await fetch('/api/tickets');
      const ticketMetadata: Record<string, TicketMeta> = metaRes.ok ? await metaRes.json() : {};

      // 3. Map & Join data
      const mappedTickets: TicketItem[] = rawTickets.map(row => {
        const rawTimestamp = row[timestampIdx] || '';
        const rawSubLoc = row[subLocIdx] || '';
        const ticketId = `${rawTimestamp}_${rawSubLoc}`;
        
        // Extract real category
        const completedVal = row[completedAmountIdx] || '';
        const category = completedVal.replace(/^TICKET:\s*/i, '');

        // Override defaults with saved metadata
        const savedMeta = ticketMetadata[ticketId];
        
        return {
          id: ticketId,
          timestamp: rawTimestamp,
          csoUid: row[csoIdx] || '',
          csoName: row[csoNameIdx] || 'Unknown CSO',
          mainLocation: row[mainLocIdx] || '',
          subLocation: rawSubLoc,
          category: category,
          geoCompliance: row[geoCodeIdx] || '',
          proofImage: row[proofImageIdx] || '',
          status: savedMeta ? savedMeta.status : 'Pending',
          comment: savedMeta ? savedMeta.comment : '',
          updatedBy: savedMeta?.updatedBy,
          updatedAt: savedMeta?.updatedAt,
        };
      });

      // Sort by timestamp descending (newest first)
      mappedTickets.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTickets(mappedTickets);
    } catch (error) {
      console.error('Error loading tickets:', error);
    }
  };

  useEffect(() => {
    fetchTicketsData().finally(() => setLoading(false));
    
    // Retrieve admin's active guard info if cached
    const savedUid = localStorage.getItem('X_GUARD_ACTIVE_UID');
    if (savedUid) {
      setLocalGuardName(savedUid.toUpperCase());
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTicketsData();
    setRefreshing(false);
  };

  const handleUpdateTicket = async (ticketId: string, status: 'Pending' | 'Completed') => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/tickets/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          status,
          comment: editComment,
          updatedBy: localGuardName
        })
      });

      if (response.ok) {
        // Success
        await fetchTicketsData();
        // Clear or pick next
        setEditComment('');
        setSelectedTicketId(null);
      } else {
        alert('Could not record ticket resolution metadata. Server issue.');
      }
    } catch (e: any) {
      console.error(e);
      alert('Error updating ticket: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items
  const filteredTickets = tickets.filter(t => {
    // 1. Status Filter
    if (statusFilter !== 'All' && t.status !== statusFilter) return false;

    // 2. Search Term Match
    if (searchTerm) {
      const searchLowercase = searchTerm.toLowerCase();
      return (
        t.subLocation.toLowerCase().includes(searchLowercase) ||
        t.mainLocation.toLowerCase().includes(searchLowercase) ||
        t.category.toLowerCase().includes(searchLowercase) ||
        t.csoName.toLowerCase().includes(searchLowercase) ||
        t.csoUid.toLowerCase().includes(searchLowercase) ||
        t.comment.toLowerCase().includes(searchLowercase)
      );
    }
    return true;
  });

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // Counters
  const pendingCount = tickets.filter(t => t.status === 'Pending').length;
  const completedCount = tickets.filter(t => t.status === 'Completed').length;

  if (loading) {
    return <div className="text-[#FBDF07] font-mono p-8 text-center animate-pulse tracking-widest uppercase">Initializing Ticket Manager...</div>;
  }

  return (
    <div className="w-full flex-1 flex flex-col bg-black pb-8" id="ticket-manager-view">
      {/* Dynamic Header */}
      <div className="p-4 md:p-6 bg-zinc-900/50 border-b border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="flex items-end gap-4 animate-fade-in">
          <h2 className="text-5xl md:text-6xl font-black tracking-tighter leading-none opacity-20">05</h2>
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-widest text-red-500">CSO Incident Desk</span>
            <span className="text-sm font-bold text-white uppercase mt-1">Ticket Manager</span>
          </div>
        </div>

        {/* Counter Widget Rows */}
        <div className="flex gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-[10px] uppercase tracking-wider px-4 py-2.5 border border-zinc-800 transition-colors cursor-pointer"
          >
            <Clock size={12} className={refreshing ? "animate-spin text-[#FBDF07]" : ""} />
            {refreshing ? "SYNCING..." : "RELOAD TICKETS"}
          </button>
        </div>
      </div>

      {/* Bento Grid Analytics Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 md:p-6">
        <div 
          onClick={() => setStatusFilter('Pending')}
          className={`p-6 border flex items-center justify-between cursor-pointer transition-all ${statusFilter === 'Pending' ? 'bg-red-950/20 border-red-500/80 shadow-lg shadow-red-950/20' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}
        >
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400">UNRESOLVED ALARMS</span>
            <h3 className="text-4xl font-black text-white">{pendingCount}</h3>
          </div>
          <div className="w-12 h-12 rounded bg-red-500/10 flex items-center justify-center text-red-500">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter('Completed')}
          className={`p-6 border flex items-center justify-between cursor-pointer transition-all ${statusFilter === 'Completed' ? 'bg-green-950/20 border-green-500/80 shadow-lg shadow-green-950/20' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'}`}
        >
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-400">RESOLVED TICKETS</span>
            <h3 className="text-4xl font-black text-white">{completedCount}</h3>
          </div>
          <div className="w-12 h-12 rounded bg-green-500/10 flex items-center justify-center text-green-500">
            <CheckCircle size={24} />
          </div>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 bg-zinc-950 border-b border-zinc-800 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mr-2 md:block hidden">Filter:</span>
          {(['All', 'Pending', 'Completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-2 font-black text-[10px] uppercase tracking-wider transition-all border ${
                statusFilter === f 
                  ? 'bg-white text-black border-white' 
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
              }`}
            >
              {f === 'All' ? 'View All' : f === 'Pending' ? `PENDING (${pendingCount})` : `RESOLVED (${completedCount})`}
            </button>
          ))}
        </div>

        {/* Live Filter Lookup Input */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="FILTER TICKETS BY KEYWORD..."
            className="w-full bg-black border border-zinc-700 p-3 text-white text-xs font-mono placeholder:text-zinc-600 focus:border-[#FBDF07] focus:outline-none uppercase"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={14} className="absolute right-3.5 top-3.5 text-zinc-600" />
        </div>
      </div>

      {/* Two-Column split for List & Resolution Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6">
        {/* Ticket list - column span 7 */}
        <div className="lg:col-span-7 flex flex-col space-y-3">
          <h3 className="text-xs font-black uppercase text-zinc-400 tracking-wider">
            {statusFilter === 'All' ? 'Record Stream' : `${statusFilter} Incident Log`} ({filteredTickets.length})
          </h3>

          {filteredTickets.length === 0 ? (
            <div className="p-12 border border-dashed border-zinc-800 bg-zinc-950 text-center flex flex-col items-center justify-center rounded-none">
              <ShieldAlert className="text-zinc-700 w-12 h-12 mb-3" />
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">No matching tickets indexed</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredTickets.map(ticket => {
                const isSelected = selectedTicketId === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    onClick={() => {
                      setSelectedTicketId(ticket.id === selectedTicketId ? null : ticket.id);
                      setEditComment(ticket.comment || '');
                    }}
                    className={`p-4 border transition-all text-left cursor-pointer hover:border-zinc-500 relative flex flex-col gap-2 ${
                      isSelected 
                        ? 'bg-zinc-900 border-zinc-300' 
                        : ticket.status === 'Completed'
                          ? 'bg-zinc-950/40 border-zinc-900 opacity-60'
                          : 'bg-zinc-900/60 border-zinc-800'
                    }`}
                  >
                    {/* Top Row: Timestamp and status */}
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-zinc-500 font-bold">{ticket.timestamp}</span>
                      <span className={`px-2.5 py-0.5 font-bold uppercase tracking-widest rounded-full ${
                        ticket.status === 'Completed' 
                          ? 'bg-green-950 text-green-400 border border-green-800/50' 
                          : 'bg-red-950 text-red-400 border border-red-800/50 animate-pulse'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>

                    {/* Middle Row: Content and CSO */}
                    <div>
                      <h4 className="text-white text-sm font-bold uppercase tracking-wide">
                        {ticket.category}
                      </h4>
                      <p className="text-zinc-400 text-xs mt-1 font-sans font-medium">
                        Spot: <span className="text-zinc-200">{ticket.mainLocation} &gt; {ticket.subLocation}</span>
                      </p>
                    </div>

                    {ticket.comment && (
                      <div className="bg-black/40 border-l-2 border-[#FBDF07] p-2.5 text-[11px] font-mono text-[#FBDF07] mt-1 space-y-1 select-none">
                        <span className="text-[9px] uppercase tracking-wider text-zinc-500 block font-sans">
                          Action taken by {ticket.updatedBy || 'Admin'} at {ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleTimeString() : 'N/A'}:
                        </span>
                        <p className="italic font-bold">&quot;{ticket.comment}&quot;</p>
                      </div>
                    )}

                    {/* Bottom Row: Reporter Information */}
                    <div className="flex justify-between items-center text-[10px] text-zinc-500 border-t border-zinc-800/50 pt-2 font-mono">
                      <span>Logged By: <span className="text-zinc-400">{ticket.csoName} ({ticket.csoUid})</span></span>
                      {ticket.proofImage && (
                        <span className="text-[#FBDF07] font-bold text-[9px] uppercase tracking-wider flex items-center gap-1">
                          IMAGE SECURED
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Resolution Details/Editor Panel - column span 5 */}
        <div className="lg:col-span-5">
          <div className="bg-zinc-950 border border-zinc-800 p-6 space-y-6 sticky top-24">
            <div className="border-b border-zinc-800 pb-4">
              <span className="text-[10px] font-black uppercase text-red-500 tracking-wider block">Incident Resolution Console</span>
              <h3 className="text-white font-black text-xl uppercase tracking-tight mt-1">Resolve and comment</h3>
            </div>

            {selectedTicket ? (
              <div className="space-y-6 text-left">
                {/* Details list */}
                <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">REPORTED TIME</span>
                      <span className="font-mono text-zinc-300 font-bold">{selectedTicket.timestamp}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">INCIDENT NATURE</span>
                      <span className="text-red-400 font-black uppercase tracking-wider">{selectedTicket.category}</span>
                    </div>
                  </div>

                  <div className="border-t border-zinc-800 pt-3">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">LOCATION DETAILS</span>
                    <span className="text-white font-bold uppercase text-xs">
                      {selectedTicket.mainLocation} &mdash; {selectedTicket.subLocation}
                    </span>
                  </div>

                  <div className="border-t border-zinc-800 pt-3">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">CSO TELEMETRY / GEOLOCK COMPLIANCE</span>
                    <p className="text-[10px] font-mono text-zinc-400 leading-normal uppercase">
                      {selectedTicket.geoCompliance}
                    </p>
                  </div>

                  {selectedTicket.proofImage && (
                    <div className="border-t border-zinc-800 pt-3 flex flex-col gap-2">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">EVIDENCE ATTACHMENT</span>
                      <a 
                        href={selectedTicket.proofImage} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 self-start bg-zinc-900 hover:bg-zinc-800 text-[#FBDF07] border border-zinc-800 font-bold px-3 py-1.5 text-[10px] tracking-widest uppercase cursor-pointer"
                      >
                        VIEW FULL SCREEN <ExternalLink size={11} />
                      </a>
                      <div className="w-full aspect-video border border-zinc-800 overflow-hidden bg-black flex items-center justify-center">
                        <img 
                          src={selectedTicket.proofImage} 
                          alt="Ticket Proof" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Suppress broken visual URL
                            (e.currentTarget as any).src = 'https://placehold.co/600x400/000000/FFFFFF?text=Proof+Image';
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Comment & Resolution Action Form */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">What was done to render it benign / resolved?</label>
                    <textarea
                      className="w-full h-24 bg-black border border-zinc-700 p-4 font-mono text-xs text-white focus:outline-none focus:border-[#FBDF07] placeholder:text-zinc-700 uppercase"
                      placeholder="Comment on incident resolution (e.g. Locked gate / Fire brigade called / Patrol site checked...)"
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                    />
                  </div>

                  {/* Actions buttons */}
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => handleUpdateTicket(selectedTicket.id, 'Completed')}
                      disabled={isSubmitting || !editComment.trim()}
                      className="w-full bg-green-500 text-white font-black hover:bg-green-600 disabled:opacity-40 disabled:hover:bg-green-500 py-3 text-xs tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <CheckCircle size={14} /> {isSubmitting ? 'WORKING...' : 'RESOLVE & MARK COMPLETED'}
                    </button>

                    <button
                      onClick={() => handleUpdateTicket(selectedTicket.id, 'Pending')}
                      disabled={isSubmitting}
                      className="w-full bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-400 py-3 text-xs font-black tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <AlertTriangle size={14} /> KEEP PENDING / SAVE COMMENT
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center border border-dashed border-zinc-800 flex flex-col items-center justify-center">
                <MessageSquare className="text-zinc-800 w-12 h-12 mb-3" />
                <p className="text-zinc-600 text-xs font-mono uppercase tracking-widest leading-relaxed">
                  Select an incident from the log list to view full telemetry details, evidence photo, and record resolution comments.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
