import Papa from 'papaparse';

export const DEFAULT_SPREADSHEET_ID = '1MaGvmF9o6Zh9p61ej7AR2MXyv6pZfkOLRtt08KAxpfU';

export interface Guard {
  uid: string;
  name: string;
  rank: string;
  contactNo: string;
  password?: string;
  location?: string;
  googleProfiles?: string;
}

export interface PatrolLocation {
  clientLocation: string; 
  address: string;
  subLocation: string;    
  geocode: string;       
  timeToScan: string[];  
  delayMinutes: number;   
}

export const fetchCSVText = async (url: string, signal?: AbortSignal): Promise<string> => {
  const processResponse = async (response: Response) => {
    if (response.ok) {
      const text = await response.text();
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html') || text.trim().startsWith('<!doctype')) {
        throw new Error('Received HTML instead of CSV (likely auth redirect)');
      }
      return text;
    }
    throw new Error(`Non-OK status: ${response.status}`);
  };

  // Try 1: Local Server CSV Proxy (highly secure & robust, bypasses client-side CORS completely)
  const localProxyUrl = `/api/proxy-csv?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetch(localProxyUrl, { signal });
    return await processResponse(response);
  } catch (error) {
    console.warn('Local server CSV proxy failed, trying direct fetch...', error);
  }

  // Try 2: Direct fetch (as backup)
  try {
    const response = await fetch(url, { signal });
    return await processResponse(response);
  } catch (error) {
    console.warn('Direct fetch of CSV failed, trying alternate proxy...', error);
  }

  // Try 3: api.allorigins.win proxy (highly reliable backup CORS proxy)
  const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetch(allOriginsUrl, { signal });
    return await processResponse(response);
  } catch (error) {
    console.warn('Allorigins proxy failed, trying corsproxy.io...', error);
  }

  // Try 4: corsproxy.io proxy
  const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetch(corsProxyUrl, { signal });
    return await processResponse(response);
  } catch (error) {
    console.warn('corsproxy.io failed', error);
  }

  throw new Error('Failed to fetch CSV data via direct URL or any available CORS proxies.');
};

export const fetchGuards = async (): Promise<Guard[]> => {
  const spreadsheetId = DEFAULT_SPREADSHEET_ID;
  const urlDirect = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`;
  const urlStatic = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRtZNHMV2z2IMrSsuZNuQ59HE463061XRLs87FUFOGHAzaN1AXdAdkxt5L_C5qb4OPHygQ0qbjo0BJn/pub?gid=0&single=true&output=csv';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    let csvText = '';
    try {
      csvText = await fetchCSVText(urlDirect, controller.signal);
    } catch (e) {
      console.warn('Failed to fetch from custom sheet URL, trying static fallback:', e);
      csvText = await fetchCSVText(urlStatic, controller.signal);
    }
    clearTimeout(timeoutId);
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const guards = results.data.map((row: any) => ({
              uid: row['UID'] || '',
              name: row['NAME'] || '',
              rank: row['RANK'] || '',
              contactNo: row['CONTACT NO'] || '',
              password: row['PASSWORD '] || row['PASSWORD'] || '',
              location: row['LOCATION '] || row['LOCATION'] || '',
              googleProfiles: row['GOOLGE PROFILES ADDRESSES'] || row['GOOGLE PROFILES ADDRESSES'] || ''
            }));
            resolve(guards.filter(g => g.uid));
          } catch (err: any) {
             reject(new Error(`Error parsing guards data: ${err.message}`));
          }
        },
        error: (err: any) => reject(new Error(err.message || 'Papa parse error'))
      });
    });
  } catch (error: any) {
     throw new Error(`fetchGuards failed: ${error.message}`);
  }
};

export const fetchLocations = async (): Promise<PatrolLocation[]> => {
  const spreadsheetId = DEFAULT_SPREADSHEET_ID;
  const urlDirect = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=2097119519`;
  const urlStatic = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRtZNHMV2z2IMrSsuZNuQ59HE463061XRLs87FUFOGHAzaN1AXdAdkxt5L_C5qb4OPHygQ0qbjo0BJn/pub?gid=2097119519&single=true&output=csv';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    let csvText = '';
    try {
      csvText = await fetchCSVText(urlDirect, controller.signal);
    } catch (e) {
      console.warn('Failed to fetch locations from custom sheet URL, trying static fallback:', e);
      csvText = await fetchCSVText(urlStatic, controller.signal);
    }
    clearTimeout(timeoutId);

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            let lastClientContext = '';
            let lastAddressContext = '';
            const parsed = results.data.map((row: any) => {
              const mainLocHeader = Object.keys(row).find(k => k.toLowerCase().includes('client location') || k.toLowerCase().includes('main location') || k.toLowerCase() === 'location');
              const subLocHeader = Object.keys(row).find(k => k.toLowerCase().includes('sub location') || k.toLowerCase().includes('sub_location'));
              const addressHeader = Object.keys(row).find(k => k.toLowerCase().includes('address'));
              const timeHeader = Object.keys(row).find(k => k.toLowerCase().includes('time to scan'));
              const delayHeader = Object.keys(row).find(k => k.toLowerCase().includes('delay'));
              const geoHeader = Object.keys(row).find(k => k.toLowerCase().includes('geocode'));

              const mainLocVal = mainLocHeader ? row[mainLocHeader] : '';
              if (mainLocVal) {
                 lastClientContext = mainLocVal;
              }
              const addrVal = addressHeader ? row[addressHeader] : '';
              if (addrVal) {
                 lastAddressContext = addrVal;
              }
              
              let times: string[] = [];
              if (timeHeader && row[timeHeader]) {
                times = String(row[timeHeader]).split('/').map(t => t.trim()).filter(Boolean);
              }
              
              let delay = 15;
              if (delayHeader && row[delayHeader]) {
                delay = parseInt(row[delayHeader]) || 15;
              }
              
              return {
                clientLocation: mainLocVal || lastClientContext,
                address: addrVal || lastAddressContext,
                subLocation: subLocHeader ? row[subLocHeader] : '',
                geocode: geoHeader ? row[geoHeader] : '',
                timeToScan: times,
                delayMinutes: delay
              };
            }).filter(l => l.subLocation);
            resolve(parsed);
          } catch (err: any) {
             reject(new Error(`Error parsing locations data: ${err.message}`));
          }
        },
        error: (err: any) => reject(new Error(err.message || 'Papa parse error in locations'))
      });
    });
  } catch (error: any) {
     throw new Error(`fetchLocations failed: ${error.message}`);
  }
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  // Haversine formula
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
};
