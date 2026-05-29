import { fetchCSVText, DEFAULT_SPREADSHEET_ID } from './utils';

export { DEFAULT_SPREADSHEET_ID };

export interface PatrolLog {
  timestamp: string;
  cso: string;
  csoName: string;
  mainLocation: string;
  subLocation: string;
  completedAmount: string; // E.g., 'ON TIME' or 'LATE'
  geoCodeCompliance: string; // 'WITHIN 50M' or 'OUTSIDE 50M' or 'NO GEOCODE'
}

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

export const uploadImageToDrive = async (file: File, locationName: string): Promise<string> => {
  try {
    const base64Data = await fileToBase64(file);
    const name = `Patrol_${locationName}_${new Date().toISOString()}.jpg`;
    const mimeType = file.type || 'image/jpeg';

    const response = await fetch('/api/sheets/upload-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType, base64Data })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to upload image to Drive via server');
    }

    const data = await response.json();
    return data.id || '';
  } catch (error: any) {
    console.error('Error uploading image to Drive:', error);
    throw new Error(`Upload to Google Drive failed: ${error.message || error}`);
  }
};

export const getLogsSheetTitle = async (spreadsheetId: string): Promise<string> => {
  try {
    const response = await fetch('/api/sheets/resolve-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spreadsheetId })
    });
    if (response.ok) {
      const meta = await response.json();
      // Look for the sheet where sheetId matches 856885035 (the gid for LOGS)
      const targetSheet = meta.sheets?.find((s: any) => s.properties?.sheetId === 856885035);
      if (targetSheet && targetSheet.properties?.title) {
        return targetSheet.properties.title;
      }
      // If we don't find it directly by ID, look for a sheet with "LOG" in the name
      const logSearch = meta.sheets?.find((s: any) => s.properties?.title?.toUpperCase().includes('LOG'));
      if (logSearch && logSearch.properties?.title) {
        return logSearch.properties.title;
      }
      // Fallback: If 3 or more sheets exist, default to the third sheet
      if (meta.sheets && meta.sheets.length >= 3) {
        return meta.sheets[2].properties?.title || 'LOGS';
      }
      // Fallback: Use last sheet
      if (meta.sheets && meta.sheets.length > 0) {
        return meta.sheets[meta.sheets.length - 1].properties?.title || 'LOGS';
      }
    }
  } catch (error) {
    console.warn('Failed to resolve custom sheet tabs via Sheets API, defaulting to LOGS:', error);
  }
  return 'LOGS';
};

export const fetchSummaryLogs = async (): Promise<any[]> => {
  const spreadsheetId = DEFAULT_SPREADSHEET_ID;

  try {
    const logsSheetName = await getLogsSheetTitle(spreadsheetId);
    const response = await fetch(
      `/api/sheets/values?spreadsheetId=${spreadsheetId}&range=${encodeURIComponent(logsSheetName + '!A1:H2000')}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.values && Array.isArray(data.values)) {
        return data.values;
      }
    } else {
      console.warn(`Failed to read from server Sheets API (Status ${response.status}). Trying fallback...`);
    }
  } catch (error) {
    console.warn('Error reading from server Sheets API directly:', error);
  }

  // Fallback: Default published CSV (only valid for the default template sheet when not signed in or as backup)
  if (spreadsheetId === DEFAULT_SPREADSHEET_ID) {
    const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRtZNHMV2z2IMrSsuZNuQ59HE463061XRLs87FUFOGHAzaN1AXdAdkxt5L_C5qb4OPHygQ0qbjo0BJn/pub?gid=856885035&single=true&output=csv';
    try {
      const csvText = await fetchCSVText(url);
      return new Promise((resolve, reject) => {
        import('papaparse').then((Papa) => {
          Papa.default.parse(csvText, {
            header: false,
            skipEmptyLines: true,
            complete: (results) => {
              resolve(results.data);
            },
            error: (err: any) => reject(err)
          });
        });
      });
    } catch (err) {
      console.error('Fallback static CSV fetch failed:', err);
    }
  }

  // Return a minimal header structure if no records can be retrieved
  return [['TIMESTAMP', 'CSO', 'CSO NAME', 'MAIN LOCATION', 'SUB LOCATION', 'COMPLETED AMOUNT', 'GEOCODE COMPLIANCE', 'PROOF IMAGE']];
};

export const logPatrolToSheet = async (log: PatrolLog, imageUrl: string = "") => {
  const spreadsheetId = DEFAULT_SPREADSHEET_ID;
  try {
    const logsSheetName = await getLogsSheetTitle(spreadsheetId);

    const values = [
      [
        log.timestamp,
        log.cso,
        log.csoName,
        log.mainLocation,
        log.subLocation,
        log.completedAmount,
        log.geoCodeCompliance,
        imageUrl
      ]
    ];

    const response = await fetch('/api/sheets/append', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        spreadsheetId,
        range: `${logsSheetName}!A1`,
        values
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errorMsg = errData.error || `Failed to save to Google Sheet (HTTP ${response.status})`;
      throw new Error(errorMsg);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error logging patrol to spreadsheet:', error);
    throw new Error(error.message || 'Failed to save to Google Sheet');
  }
};
