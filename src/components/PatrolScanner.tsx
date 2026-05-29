import React, { useState, useEffect, useRef, useCallback } from 'react';
import { calculateDistance, Guard, PatrolLocation } from '../utils';
import { logPatrolToSheet, uploadImageToDrive, PatrolLog } from '../api';
import { ShieldAlert, CheckCircle, Upload, Camera, QrCode } from 'lucide-react';
import { format, parse, differenceInMinutes, isValid } from 'date-fns';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';

const CustomWebcam = Webcam as any;

interface Props {
  activeGuard: Guard;
  locations: PatrolLocation[];
}

export default function PatrolScanner({ activeGuard, locations }: Props) {
  const [logStatus, setLogStatus] = useState<'idle' | 'logging' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  
  const [selectedMainLoc, setSelectedMainLoc] = useState<string>('');
  const [selectedSubLoc, setSelectedSubLoc] = useState<string>('');
  const [photoFile, setPhotoFileState] = useState<File | null>(null);
  const photoFileRef = useRef<File | null>(null);
  const setPhotoFile = (file: File | null) => {
    setPhotoFileState(file);
    photoFileRef.current = file;
  };
  const [activeTab, setActiveTab] = useState<'scan' | 'ticket'>('scan');
  const [incidentType, setIncidentType] = useState('Damage');
  const [incidentDesc, setIncidentDesc] = useState('');

  
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [cameraMode, setCameraMode] = useState<'idle' | 'photo' | 'qr'>('idle');
  const webcamRef = useRef<Webcam>(null);

  const mainLocations = Array.from(new Set(locations.map(l => l.clientLocation))).filter(Boolean);
  const availableSubLocs = selectedMainLoc ? locations.filter(l => l.clientLocation === selectedMainLoc) : [];

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      }, (err) => {
        console.warn("Geolocation warning:", err.message);
      }, {
        enableHighAccuracy: true
      });
    }
  }, []);

  // Real-time camera QR scanning loop using jsQR
  useEffect(() => {
    if (cameraMode !== 'qr') return;
    let active = true;
    let timerId: any = null;

    const scanFrame = () => {
      if (!active) return;
      
      try {
        const video = webcamRef.current?.video;
        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert"
            });
            if (qrCode && qrCode.data) {
              console.log("QR Code Decoded in real-time camera loop:", qrCode.data);
              handleScan(qrCode.data);
              active = false;
              return;
            }
          }
        }
      } catch (err) {
        console.warn("QR frame scan error:", err);
      }

      if (active) {
        timerId = setTimeout(scanFrame, 300); // Check 3 times per second
      }
    };

    timerId = setTimeout(scanFrame, 600); // Small initial delay to warm up video

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [cameraMode, selectedSubLoc, selectedMainLoc, logStatus]);

  const capturePhoto = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
          setPhotoFile(file);
          setCameraMode('idle');
        });
    }
  }, [webcamRef]);

  const getLatestUserLocation = (): Promise<{lat: number, lng: number} | null> => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.warn("Get current position on demand failed:", err.message);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });
  };

  const handleScan = async (scannedText: string) => {
    if (!scannedText || logStatus === 'logging') return;
    
    setCameraMode('idle');
    setLogStatus('logging');
    setStatusMessage('Validating QR Code & GPS coordinates...');
    
    // Acquire a high-accuracy fresh GPS lock
    let latestLoc = userLocation;
    try {
      setStatusMessage('Acquiring high-accuracy GPS lock...');
      const freshLoc = await getLatestUserLocation();
      if (freshLoc) {
        latestLoc = freshLoc;
        setUserLocation(freshLoc);
      }
    } catch (gpsErr) {
      console.warn("High accuracy GPS lookup failed:", gpsErr);
    }

    let isValidTag = false;

    // Check if it's the old JSON format
    try {
      const parsedData = JSON.parse(scannedText);
      if (parsedData.c === selectedMainLoc && parsedData.s === selectedSubLoc) {
        isValidTag = true;
      }
    } catch {
      // Or if it's a direct string match
      if (
        scannedText.toLowerCase() === selectedSubLoc.toLowerCase() ||
        scannedText.toLowerCase() === `${selectedMainLoc} - ${selectedSubLoc}`.toLowerCase() ||
        scannedText === "TICKET"
      ) {
        isValidTag = true;
      }
    }

    if (!isValidTag && activeTab !== 'ticket') {
      setStatusMessage('QR Code does not match the selected checkpoint.');
      setLogStatus('error');
      setPhotoFile(null); // Force them to retake if they scan the wrong one?
      return;
    }

    const matchedLoc = locations.find(l => l.clientLocation === selectedMainLoc && l.subLocation === selectedSubLoc);

    if (!matchedLoc) {
       setStatusMessage(`Selected location config missing.`);
       setLogStatus('error');
       return;
    }

    // Process Logging
    let geoCompliance = 'NO GEOCODE ASSIGNED';
    let timingStatus = 'ON TIME';

    if (activeTab === 'ticket') {
       timingStatus = `TICKET: ${incidentType}`;
       geoCompliance = `INCIDENT REPORTED: ${incidentDesc.slice(0, 40)}`;
       if (latestLoc) {
         geoCompliance += ` (Lat: ${latestLoc.lat.toFixed(6)}, Lng: ${latestLoc.lng.toFixed(6)})`;
       }
    } else {
       // 1. Geocode Compliance CHECK (within 50 meters)
       if (matchedLoc.geocode && latestLoc) {
           const [targetLat, targetLng] = matchedLoc.geocode.split(',').map(n => parseFloat(n.trim()));
           if (!isNaN(targetLat) && !isNaN(targetLng)) {
               const distMeters = calculateDistance(latestLoc.lat, latestLoc.lng, targetLat, targetLng);
               const roundedDist = Math.round(distMeters * 10) / 10;
               geoCompliance = distMeters <= 50 
                 ? `COMPLIANT: WITHIN 50M (Distance: ${roundedDist}m, Lat: ${latestLoc.lat.toFixed(6)}, Lng: ${latestLoc.lng.toFixed(6)})` 
                 : `NON-COMPLIANT: OUTSIDE 50M (Distance: ${roundedDist}m, Lat: ${latestLoc.lat.toFixed(6)}, Lng: ${latestLoc.lng.toFixed(6)})`;
           }
       } else if (!latestLoc) {
           geoCompliance = 'ERROR: LOCATION SERVICES DISABLED / TIMEOUT (Could not establish GPS lock)';
       }
       
       // 2. Timing
       if (matchedLoc.timeToScan.length > 0) {
          const now = new Date();
          let closestTargetDate: Date | null = null;
          let smallestDiff = Infinity;
          
          for (const timeStr of matchedLoc.timeToScan) {
              let cleanStr = timeStr.trim().toUpperCase().replace(/\s/g, ''); 
              let tDate: Date | null = null;
              
              try {
                if (cleanStr.includes('AM') || cleanStr.includes('PM')) {
                    tDate = parse(cleanStr, 'ha', now);
                    if (isNaN(tDate.getTime())) tDate = parse(cleanStr, 'h:mma', now);
                } else {
                    tDate = parse(cleanStr, 'HH:mm', now);
                    if (isNaN(tDate.getTime())) tDate = parse(cleanStr, 'H:mm', now);
                }
              } catch (e) {}

              if (tDate && !isNaN(tDate.getTime())) {
                  const diff = differenceInMinutes(now, tDate);
                  if (diff >= 0 && diff < smallestDiff) {
                      smallestDiff = diff;
                      closestTargetDate = tDate;
                  }
              }
          }

          if (closestTargetDate) {
              if (smallestDiff > matchedLoc.delayMinutes) {
                  timingStatus = `DELAYED (${smallestDiff}m)`;
              } else {
                  timingStatus = `ON TIME (${smallestDiff}m)`;
              }
          } else {
              timingStatus = `UNKNOWN_FORMAT`;
          }
       }
    }

    const logData: PatrolLog = {
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      cso: activeGuard.uid,
      csoName: activeGuard.name,
      mainLocation: matchedLoc.clientLocation,
      subLocation: matchedLoc.subLocation,
      completedAmount: timingStatus,
      geoCodeCompliance: geoCompliance
    };

    try {
       setStatusMessage(`Uploading proof photo...`);
       let driveLink = '';
       const currentPhoto = photoFileRef.current;
       if (currentPhoto) {
         console.log('Found captured proof image to upload:', currentPhoto.name, currentPhoto.size);
         const fileId = await uploadImageToDrive(currentPhoto, matchedLoc.subLocation.replace(/ /g, '_'));
         if (fileId.startsWith('/') || fileId.startsWith('http')) {
           driveLink = fileId.startsWith('http') ? fileId : `${window.location.origin}${fileId}`;
         } else {
           driveLink = `https://drive.google.com/open?id=${fileId}`;
         }
       } else {
         console.warn('No photoFileRef captured inside scan loop event closure!');
       }
       
       setStatusMessage('Registering patrol logs in sheet...');
       await logPatrolToSheet(logData, driveLink);

       setStatusMessage(activeTab === 'ticket' ? `Ticket reported for ${matchedLoc.subLocation}` : `${matchedLoc.subLocation} scanned and logged!`);
       setLogStatus('success');
       setPhotoFile(null);
       setSelectedSubLoc('');
       setIncidentDesc('');
       
       setTimeout(() => setLogStatus('idle'), 4000);
    } catch (e: any) {
       console.error(e);
       setStatusMessage(`Failed to save to dispatch server. Details: ${e.message || String(e)}`);
       setLogStatus('error');
    }
  };

  const resetForm = () => {
    setLogStatus('idle');
    setPhotoFile(null);
    setCameraMode('idle');
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col bg-zinc-900 border border-zinc-800 pb-0">
      <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex items-end justify-between gap-3">
         <div className="flex items-end gap-3">
           <h2 className="text-5xl font-black tracking-tighter leading-none opacity-20">02</h2>
           <div className="flex flex-col">
             <span className="text-xs font-bold uppercase tracking-widest text-[#FBDF07]">Patrol Mode</span>
             <span className="text-sm font-bold text-white uppercase mt-1">Live Checkpoint</span>
           </div>
         </div>
      </div>

      <div className="flex border-b border-zinc-800 bg-black">
        <button 
          className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors ${activeTab === 'scan' ? 'bg-zinc-800 text-[#FBDF07]' : 'text-zinc-500 hover:text-white'}`}
          onClick={() => { setActiveTab('scan'); resetForm(); }}
        >
          QR Scan Log
        </button>
        <button 
          className={`flex-1 py-3 text-[10px] uppercase tracking-widest font-bold transition-colors ${activeTab === 'ticket' ? 'bg-zinc-800 text-red-500' : 'text-zinc-500 hover:text-white'}`}
          onClick={() => { setActiveTab('ticket'); resetForm(); }}
        >
          Report Ticket
        </button>
      </div>

      <div className="p-4 md:p-6 space-y-4 flex-1 bg-black">
        {logStatus === 'idle' && cameraMode === 'idle' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Select Main Location</label>
              <select 
                value={selectedMainLoc}
                onChange={e => { setSelectedMainLoc(e.target.value); setSelectedSubLoc(''); }}
                className="w-full bg-black border border-zinc-800 p-4 text-white focus:outline-none focus:border-[#FBDF07] transition-colors uppercase text-sm"
              >
                <option value="">-- Choose Location --</option>
                {mainLocations.map(ml => (
                  <option key={ml} value={ml}>{ml}</option>
                ))}
              </select>
            </div>

            {selectedMainLoc && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Select Checkpoint</label>
                <select 
                  value={selectedSubLoc}
                  onChange={e => setSelectedSubLoc(e.target.value)}
                  className="w-full bg-black border border-zinc-800 p-4 text-white focus:outline-none focus:border-[#FBDF07] transition-colors uppercase text-sm"
                >
                  <option value="">-- Choose Sub Location --</option>
                  {availableSubLocs.map(l => (
                    <option key={l.subLocation} value={l.subLocation}>{l.subLocation}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedSubLoc && activeTab === 'ticket' && (
              <div className="space-y-4 pt-4 border-t border-zinc-800">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Ticket Category</label>
                  <select 
                    value={incidentType}
                    onChange={e => setIncidentType(e.target.value)}
                    className="w-full bg-black border border-zinc-800 p-4 text-white focus:outline-none focus:border-red-500 transition-colors uppercase text-sm"
                  >
                    <option value="Damage">Damage</option>
                    <option value="Theft">Theft</option>
                    <option value="Breach of Operational Procedures">Breach of Operational Procedures</option>
                    <option value="Parking issues">Parking issues</option>
                    <option value="resident complaints">Resident Complaints</option>
                    <option value="other irregularities">Other Irregularities</option>
                    <option value="natural disaster">Natural Disaster</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Situation Details</label>
                  <textarea 
                    value={incidentDesc}
                    onChange={e => setIncidentDesc(e.target.value)}
                    className="w-full h-24 bg-black border border-zinc-800 p-4 text-white focus:outline-none focus:border-[#FBDF07] transition-colors text-sm placeholder:text-zinc-700"
                    placeholder="Describe what occurred..."
                  />
                </div>
              </div>
            )}

            {selectedSubLoc && !photoFile && (
              <div className={`pt-4 border-t border-zinc-800 flex flex-col gap-3 ${activeTab === 'ticket' ? 'mt-4' : ''}`}>
                <button 
                  onClick={() => setCameraMode('photo')}
                  className={`flex items-center justify-center w-full gap-2 px-6 py-4 transition-colors font-black text-xs uppercase tracking-widest ${activeTab === 'ticket' ? 'bg-red-500 text-white hover:bg-white hover:text-red-500' : 'bg-[#FBDF07] text-black hover:bg-white'}`}
                >
                  <Camera size={18} /> {activeTab === 'ticket' ? "Capture Evidence Photo" : "Capture Photo Proof"}
                </button>
              </div>
            )}

            {selectedSubLoc && photoFile && activeTab === 'scan' && (
              <div className="pt-4 border-t border-zinc-800 flex flex-col gap-3">
                 <div className="text-center text-green-500 text-xs font-bold uppercase tracking-widest">
                   Photo Evidence Secured
                 </div>
                 <button 
                   onClick={() => setCameraMode('qr')}
                   className="flex items-center justify-center w-full gap-2 bg-[#FBDF07] text-black hover:bg-white px-6 py-4 transition-colors font-black text-xs uppercase tracking-widest"
                 >
                   <QrCode size={18} /> Tap to Open QR Scanner
                 </button>
              </div>
            )}
          </div>
        )}

        {cameraMode === 'photo' && (
           <div className="w-full aspect-square bg-zinc-950 border border-zinc-800 overflow-hidden relative flex flex-col items-center justify-center p-2 mb-4">
             <div className="w-full h-full border border-zinc-800 relative">
               <CustomWebcam
                 audio={false}
                 ref={webcamRef}
                 screenshotFormat="image/jpeg"
                 videoConstraints={{ facingMode: "user" }}
                 className="w-full h-full object-cover"
               />
               <button 
                 onClick={capturePhoto} 
                 className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white text-black px-6 py-3 rounded-full font-black uppercase text-xs tracking-widest z-10 font-sans"
               >
                 Take Photo
               </button>
               <button 
                 onClick={() => setCameraMode('idle')} 
                 className="absolute top-4 right-4 bg-zinc-900/80 text-white px-4 py-2 font-bold uppercase text-[10px] tracking-widest z-10"
               >
                 Cancel
               </button>
             </div>
           </div>
        )}

        {cameraMode === 'qr' && (
           <div className="w-full aspect-square bg-zinc-950 border border-zinc-800 overflow-hidden relative flex flex-col items-center justify-center p-2 mb-4">
             <div className="w-full h-full border border-zinc-800 relative bg-black">
               <CustomWebcam
                 audio={false}
                 ref={webcamRef}
                 screenshotFormat="image/jpeg"
                 videoConstraints={{ facingMode: "environment" }}
                 className="w-full h-full object-cover"
               />
               <div className="absolute inset-0 border-2 border-[#FBDF07]/50 pointer-events-none m-8"></div>
               <div className="absolute top-4 left-4 border-t-4 border-l-4 border-[#FBDF07] w-12 h-12 pointer-events-none"></div>
               <div className="absolute top-4 right-4 border-t-4 border-r-4 border-[#FBDF07] w-12 h-12 pointer-events-none"></div>
               <div className="absolute bottom-4 left-4 border-b-4 border-l-4 border-[#FBDF07] w-12 h-12 pointer-events-none"></div>
               <div className="absolute bottom-4 right-4 border-[#FBDF07] border-b-4 border-r-4 w-12 h-12 pointer-events-none"></div>
               
               <div className="absolute top-3 left-4 right-4 text-center z-10 flex flex-col gap-1">
                 <span className="bg-black/95 px-3 py-1.5 text-[10px] font-bold uppercase text-[#FBDF07] tracking-widest border border-zinc-800">
                   [ Align QR code inside the frame ]
                 </span>
                 <span className="text-[9px] text-zinc-400 font-bold tracking-widest uppercase">
                   Real-time scan matches automatically
                 </span>
               </div>

               <button 
                 onClick={() => setCameraMode('idle')} 
                 className="absolute top-4 right-4 bg-zinc-900/85 text-white px-4 py-2 font-bold uppercase text-[10px] tracking-widest z-50 border border-zinc-800 cursor-pointer"
               >
                 Cancel
               </button>
             </div>
           </div>
        )}

        {activeTab === 'ticket' && photoFile && logStatus === 'idle' && cameraMode === 'idle' && (
           <div className="w-full aspect-square bg-zinc-950 border border-zinc-800 overflow-hidden relative flex flex-col items-center justify-center p-2 mb-4">
               <div className="text-center w-full flex flex-col p-6 space-y-4">
                  <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                     <ShieldAlert size={32} />
                  </div>
                  <h3 className="text-white font-black uppercase text-xl">Evidence Saved</h3>
                  <p className="text-sm text-zinc-400">Photo attached to your ticket report.</p>
                  
                  <button onClick={() => {
                    handleScan("TICKET")
                  }} className="w-full mt-4 bg-red-500 text-white font-black uppercase text-xs tracking-widest py-4">
                     Submit Ticket
                  </button>
               </div>
           </div>
        )}

        {(logStatus === 'logging' || logStatus === 'success' || logStatus === 'error') && (
          <div className="flex flex-col items-center p-6 text-center space-y-4 w-full justify-center">
             {logStatus === 'logging' && (
               <div className="flex flex-col items-center space-y-3">
                 <div className="w-12 h-12 rounded-sm bg-[#FBDF07] animate-pulse flex items-center justify-center">
                   <span className="text-black font-black">SYNC</span>
                 </div>
                 <div className="text-[#FBDF07] font-bold text-xs uppercase tracking-widest">{statusMessage}</div>
               </div>
             )}
             {logStatus === 'error' && (
                <div className="flex flex-col items-center space-y-3 p-6 border-l-4 border-red-500 bg-red-900/10 w-full">
                  <ShieldAlert className="text-red-500 w-12 h-12" />
                  <div className="text-red-500 font-bold text-xs uppercase tracking-wider">{statusMessage}</div>
                  <button onClick={resetForm} className="mt-4 text-xs font-bold text-red-300 underline underline-offset-4 uppercase">Try Again</button>
                </div>
             )}
             {logStatus === 'success' && (
                <div className="flex flex-col items-center space-y-3 p-6 border-l-4 border-green-500 bg-green-900/10 w-full">
                  <CheckCircle className="text-green-500 w-12 h-12" />
                  <div className="text-green-500 font-bold text-xs uppercase tracking-wider">{statusMessage}</div>
                </div>
             )}
          </div>
        )}

        <div className="w-full bg-zinc-900 border border-zinc-800 p-4 space-y-2 mt-4">
           <div className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 flex justify-between items-center border-b border-zinc-800 pb-2">
             <span>GPS Telemetry</span>
             <span className={userLocation ? 'text-green-500 font-black' : 'text-[#FBDF07] font-black animate-pulse'}>
               {userLocation ? 'ACTIVE / LINKED' : 'AWAITING LOCK'}
             </span>
           </div>
           {userLocation && (
             <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-2 pt-1">
               <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
               {userLocation.lat.toFixed(6)}° N, {userLocation.lng.toFixed(6)}° W
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
