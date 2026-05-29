import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // HARDCODED CENTRAL DATABASE ID 
  // (Individual sheets given access will point through this master ID directly)
  const SPREADSHEET_ID = '1MaGvmF9o6Zh9p61ej7AR2MXyv6pZfkOLRtt08KAxpfU';

  app.use(express.json({ limit: '50mb' }));

  app.use((err: any, req: any, res: any, next: any) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Image too large. Please upload a smaller image.' });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    next(err);
  });

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  const TOKEN_FILE_PATH = path.join(process.cwd(), 'google-token.json');
  let currentAccessToken: string | null = null;
  let tokenSavedAt: string | null = null;

  function loadStoredToken() {
    try {
      if (fs.existsSync(TOKEN_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf-8'));
        if (data && data.accessToken) {
          currentAccessToken = data.accessToken;
          tokenSavedAt = data.savedAt || new Date().toISOString();
          console.log('Successfully loaded stored Google Access Token from file.');
        }
      }
    } catch (error) {
      console.warn('Failed to load stored Google Access Token:', error);
    }
  }
  loadStoredToken();

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Token administration routes
  app.get('/api/sheets/token-status', (req, res) => {
    res.json({
      authenticated: !!currentAccessToken,
      savedAt: tokenSavedAt,
    });
  });

  app.post('/api/sheets/save-token', (req, res) => {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'Missing accessToken in request body' });
    }
    currentAccessToken = accessToken;
    tokenSavedAt = new Date().toISOString();
    try {
      fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify({
        accessToken,
        savedAt: tokenSavedAt
      }, null, 2));
      console.log('Google Access Token saved to file.');
    } catch (error) {
      console.error('Failed to write Google Access Token to file:', error);
    }
    res.json({ status: 'ok', authenticated: true, savedAt: tokenSavedAt });
  });

  app.post('/api/sheets/append', async (req, res) => {
    let { range, values } = req.body;
    
    if (!SPREADSHEET_ID || !range || !values) {
      return res.status(400).json({ error: 'Missing spreadsheet configuration mapping details, range, or values' });
    }

    // Always persist logs to local state file as backup
    const localLogsPath = path.join(process.cwd(), 'local-logs.json');
    let localLogs: any[] = [];
    try {
      if (fs.existsSync(localLogsPath)) {
        localLogs = JSON.parse(fs.readFileSync(localLogsPath, 'utf-8'));
      }
    } catch (e) {
      console.warn('Could not read local logs:', e);
    }

    // Append to local storage
    if (Array.isArray(values)) {
      localLogs.push(...values);
    }
    try {
      fs.writeFileSync(localLogsPath, JSON.stringify(localLogs, null, 2));
      console.log('Saved log to local backup file.');
    } catch (e) {
      console.warn('Could not write local logs:', e);
    }

    // Try sending to the central Google Apps Script Webhook first
    let webhookSuccess = false;
    let webhookNotes = '';
    try {
      const webhookUrl = 'https://script.google.com/macros/s/AKfycbzavHfRHlnQcaXGglzV3ogI5x2ylqeGgCu0Ujz5XZHkgBI621MhrKJLIqzo-QbHjIkY/exec';
      
      let base64OfUploadedImage = '';
      const providedImgUrl = values[0]?.[7] || '';
      if (providedImgUrl && (providedImgUrl.includes('/uploads/') || providedImgUrl.includes('localhost') || providedImgUrl.includes('.run.app'))) {
        try {
          const uparts = providedImgUrl.split('/uploads/');
          const filename = uparts[uparts.length - 1];
          const localPath = path.join(process.cwd(), 'uploads', filename);
          if (fs.existsSync(localPath)) {
            base64OfUploadedImage = fs.readFileSync(localPath).toString('base64');
            console.log(`Successfully converted locally stored image ${filename} to base64 for webhook.`);
          }
        } catch (fileErr) {
          console.warn('Failed to convert local uploaded image to base64 for webhook:', fileErr);
        }
      }

      const webhookPayload: any = {
        action: 'append',
        spreadsheetId: SPREADSHEET_ID,
        range,
        values: values[0], // Flatten the 2D array to 1D so Apps Script appendRow works correctly across columns
        timestamp: values[0]?.[0] || '',
        cso: values[0]?.[1] || '',
        csoName: values[0]?.[2] || '',
        mainLocation: values[0]?.[3] || '',
        subLocation: values[0]?.[4] || '',
        completedAmount: values[0]?.[5] || '',
        geoCodeCompliance: values[0]?.[6] || '',
        imageUrl: providedImgUrl,
        proofImage: providedImgUrl
      };

      if (base64OfUploadedImage) {
        webhookPayload.base64Image = base64OfUploadedImage;
        const fn = values[0]?.[4] ? values[0][4].replace(/[^a-zA-Z0-9]/g, '_') : 'patrol';
        webhookPayload.imageName = `${fn}_${Date.now()}.jpg`;
      }

      console.log('Posting log data to centralized Webhook:', webhookUrl);
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });

      console.log('Webhook HTTP status:', webhookRes.status);
      const resText = await webhookRes.text();
      console.log('Webhook response body:', resText.substring(0, 300));

      if (webhookRes.ok) {
        webhookSuccess = true;
        webhookNotes = 'Saved successfully to sheet via central webhook link.';
        
        try {
          const parsedRes = JSON.parse(resText);
          const driveLink = parsedRes.url || parsedRes.fileUrl || parsedRes.imageUrl;
          if (driveLink && !driveLink.includes('ERROR')) {
            console.log('Apps Script returned custom Google Drive image URL:', driveLink);
            values[0][7] = driveLink;
            webhookNotes += ` Real-Time Drive Image Link locked: ${driveLink}`;
          } else if (driveLink && driveLink.includes('ERROR')) {
            console.error('Apps Script Drive upload failed:', driveLink);
            webhookNotes += ` Drive Upload Error: ${driveLink}`;
          }
        } catch {}
      } else {
        webhookNotes = `Webhook returned HTTP ${webhookRes.status}: ${resText}`;
      }
    } catch (err: any) {
      console.error('Apps Script webhook call failed:', err);
      webhookNotes = `Webhook lookup/execution failed: ${err.message || String(err)}`;
    }

    if (webhookSuccess) {
      return res.json({ status: 'ok', notes: webhookNotes });
    }

    // Fallback: Try Sheets API with dynamic authentication token if present
    if (!currentAccessToken) {
      console.log('Server is not authenticated with Google. Local backup saved.');
      return res.json({ status: 'ok', notes: `Local backup saved. Webhook was offline: ${webhookNotes}` });
    }

    try {
      const gResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentAccessToken}`
          },
          body: JSON.stringify({ values })
        }
      );

      if (!gResponse.ok) {
        const errorText = await gResponse.text();
        console.error('Google Sheets API append failed. Local backup is active.', errorText);
        return res.json({ status: 'ok', notes: `Local backup saved. Sheets update skipped: ${errorText}` });
      }

      const resData = await gResponse.json();
      return res.json(resData);
    } catch (error: any) {
      console.error('Error appending to Google Sheets:', error);
      return res.json({ status: 'ok', notes: `Local backup saved. Sheets update deferred.` });
    }
  });

  app.get('/api/sheets/values', async (req, res) => {
    let { range } = req.query;
    if (!range) {
      return res.status(400).json({ error: 'Missing range parameter' });
    }

    let sheetValues: any[][] = [];
    let success = false;

    // 1. Try Google Sheets API with Access Token if present
    if (currentAccessToken) {
      try {
        const gResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range as string)}`,
          {
            headers: {
              Authorization: `Bearer ${currentAccessToken}`
            }
          }
        );

        if (gResponse.ok) {
          const resData = await gResponse.json();
          if (resData.values && Array.isArray(resData.values)) {
            sheetValues = resData.values;
            success = true;
          }
        }
      } catch (error) {
        console.warn('Google Sheets API direct fetching failed, trying CSV export fallback...', error);
      }
    }

    // 2. Fallback to public CSV export URL if sheet has link sharing enabled
    if (!success) {
      try {
        let gid = '0';
        const uRange = String(range).toUpperCase();
        if (uRange.includes('LOG')) {
          gid = '856885035';
        } else if (uRange.includes('CHECK') || uRange.includes('LOCATION')) {
          gid = '2097119519';
        }

        const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
        const csvResponse = await fetch(csvUrl);
        if (csvResponse.ok) {
          const contentType = csvResponse.headers.get('content-type') || '';
          if (contentType.includes('html')) {
            throw new Error('CSV fallback returned HTML pages (private sheet access missing).');
          }
          const csvText = await csvResponse.text();
          if (csvText.startsWith('<!DOCTYPE html') || csvText.includes('<html')) {
            throw new Error('CSV fallback returned HTML content.');
          }

          const rows: any[][] = [];
          let row: string[] = [];
          let cell = '';
          let inQuotes = false;
          
          for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                cell += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              row.push(row.length === 7 ? cell : cell.trim());
              cell = '';
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
              if (char === '\r' && nextChar === '\n') {
                i++;
              }
              row.push(row.length === 7 ? cell : cell.trim());
              if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
                rows.push(row);
              }
              row = [];
              cell = '';
            } else {
              cell += char;
            }
          }
          if (cell !== '' || row.length > 0) {
            row.push(row.length === 7 ? cell : cell.trim());
            rows.push(row);
          }
          if (rows.length > 0) {
            sheetValues = rows;
            success = true;
            console.log(`Successfully fetched range ${range} via CSV export fallback.`);
          }
        }
      } catch (err: any) {
        console.warn('CSV export fallback failed:', err.message);
      }
    }

    // 3. Merge with local backup logs if we are querying the logs sheet
    const localLogsPath = path.join(process.cwd(), 'local-logs.json');
    let localLogs: any[] = [];
    try {
      if (fs.existsSync(localLogsPath)) {
        localLogs = JSON.parse(fs.readFileSync(localLogsPath, 'utf-8'));
      }
    } catch (e) {
      console.warn('Could not read local logs for merge:', e);
    }

    if (sheetValues.length === 0) {
      sheetValues = [['TIMESTAMP', 'CSO', 'CSO NAME', 'MAIN LOCATION', 'SUB LOCATION', 'COMPLETED AMOUNT', 'GEOCODE COMPLIANCE', 'PROOF IMAGE']];
    }

    const existingKeys = new Set(
      sheetValues.map(row => {
        const ts = String(row[0] || '').trim();
        const cso = String(row[1] || '').trim().toLowerCase();
        const sub = String(row[4] || '').trim().toLowerCase();
        return `${ts}|${cso}|${sub}`;
      })
    );

    for (const log of localLogs) {
      if (Array.isArray(log) && log.length >= 7) {
        const ts = String(log[0] || '').trim();
        const cso = String(log[1] || '').trim().toLowerCase();
        const sub = String(log[4] || '').trim().toLowerCase();
        const key = `${ts}|${cso}|${sub}`;

        if (!existingKeys.has(key)) {
          const paddedLog = [...log];
          while (paddedLog.length < 8) {
            paddedLog.push('');
          }
          sheetValues.push(paddedLog);
          existingKeys.add(key);
        }
      }
    }

    return res.json({ values: sheetValues });
  });

  app.post('/api/sheets/clear', (req, res) => {
    try {
      const localLogsPath = path.join(process.cwd(), 'local-logs.json');
      fs.writeFileSync(localLogsPath, JSON.stringify([], null, 2));
      console.log('Cleared all local logs on the server.');
      return res.json({ status: 'ok', message: 'Local logs cleared successfully' });
    } catch (error: any) {
      console.error('Failed to clear local logs:', error);
      return res.status(500).json({ error: error.message || 'Failed to clear local logs' });
    }
  });

  app.post('/api/sheets/resolve-title', async (req, res) => {
    if (!currentAccessToken) {
      return res.json({ sheets: [{ properties: { sheetId: 856885035, title: 'LOGS' } }] });
    }

    try {
      const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
        headers: {
          Authorization: `Bearer ${currentAccessToken}`
        }
      });
      if (!metaResponse.ok) {
        return res.json({ sheets: [{ properties: { sheetId: 856885035, title: 'LOGS' } }] });
      }
      const meta = await metaResponse.json();
      return res.json(meta);
    } catch (error: any) {
      return res.json({ sheets: [{ properties: { sheetId: 856885035, title: 'LOGS' } }] });
    }
  });

  app.post('/api/sheets/upload-file', async (req, res) => {
    const { name, mimeType, base64Data, qrData } = req.body;
    if (!name || !mimeType || !base64Data) {
      return res.status(400).json({ error: 'Missing file fields (name, mimeType, base64Data)' });
    }

    try {
      const safeName = name.replace(/[^a-zA-Z0-9_\.-]/g, '_');
      const filePath = path.join(process.cwd(), 'uploads', safeName);
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      console.log(`Image saved locally: /uploads/${safeName}`);

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const absoluteUrl = `${protocol}://${host}/uploads/${safeName}`;

      if (currentAccessToken) {
        try {
          console.log('Access token present on the server. Attempting direct upload to Google Drive catalog...');
          
          const metadata = {
            name: safeName,
            mimeType: mimeType
          };
          const boundary = '-------314159265358979323846';
          const delimiter = `\r\n--${boundary}\r\n`;
          const close_delim = `\r\n--${boundary}--`;
          
          const binaryData = Buffer.from(base64Data, 'base64');
          
          const metadataStr = JSON.stringify(metadata);
          const multipartBody = Buffer.concat([
            Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + metadataStr + delimiter + 'Content-Type: ' + mimeType + '\r\n\r\n'),
            binaryData,
            Buffer.from(close_delim)
          ]);

          const driveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${currentAccessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
          });

          if (driveResponse.ok) {
            const driveData = await driveResponse.json();
            const fileId = driveData.id;
            console.log('Direct Google Drive upload succeeded. File ID:', fileId);

            try {
              await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${currentAccessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  role: 'reader',
                  type: 'anyone'
                })
              });
              console.log('Successfully made Google Drive uploaded file readable by anyone.');
            } catch (permissionErr) {
              console.warn('Could not set readable permissions on Drive file:', permissionErr);
            }

            const driveUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
            
            try {
              const webhookUrl = 'https://script.google.com/macros/s/AKfycbzavHfRHlnQcaXGglzV3ogI5x2ylqeGgCu0Ujz5XZHkgBI621MhrKJLIqzo-QbHjIkY/exec';
              const webhookPayload = {
                action: 'append',
                timestamp: new Date().toISOString(),
                cso: qrData?.cso || '',
                csoName: qrData?.csoName || '',
                mainLocation: qrData?.mainLocation || '',
                subLocation: qrData?.subLocation || '',
                completedAmount: qrData?.completedAmount || 0,
                geoCodeCompliance: qrData?.geoCodeCompliance || '',
                driveImageUrl: driveUrl,
                fileId: fileId,
                values: [
                  new Date().toISOString(),
                  qrData?.cso || '',
                  qrData?.csoName || '',
                  qrData?.mainLocation || '',
                  qrData?.subLocation || '',
                  qrData?.completedAmount?.toString() || '0',
                  qrData?.geoCodeCompliance || '',
                  driveUrl
                ]
              };
              
              const webhookRes = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(webhookPayload)
              });
              
              console.log('Data sent to Apps Script. Status:', webhookRes.status);
            } catch (webhookErr) {
              console.error('Webhook error:', webhookErr);
            }

            return res.json({
              id: fileId,
              fallback: false,
              url: driveUrl
            });
          } else {
            const driveErrText = await driveResponse.text();
            console.error('Google Drive direct upload request failed. Fallback active:', driveErrText);
          }
        } catch (driveApiErr: any) {
          console.error('Google Drive direct upload API exception:', driveApiErr.message || driveApiErr);
        }
      }

      return res.json({
        id: absoluteUrl,
        fallback: false,
        url: absoluteUrl
      });
    } catch (err: any) {
      console.error('Failed to save image locally:', err);
      return res.status(500).json({ error: err.message || 'Failed to save image locally' });
    }
  });

  app.get('/api/tickets', (req, res) => {
    const ticketsPath = path.join(process.cwd(), 'local-tickets.json');
    let ticketsData = {};
    try {
      if (fs.existsSync(ticketsPath)) {
        ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
      }
    } catch (e: any) {
      console.warn('Could not read local tickets database:', e.message);
    }
    return res.json(ticketsData);
  });

  app.post('/api/tickets/update', (req, res) => {
    const { ticketId, status, comment, updatedBy } = req.body;
    if (!ticketId) {
      return res.status(400).json({ error: 'Missing ticketId parameter' });
    }

    const ticketsPath = path.join(process.cwd(), 'local-tickets.json');
    let ticketsData: Record<string, any> = {};
    try {
      if (fs.existsSync(ticketsPath)) {
        ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf-8'));
      }
    } catch (e: any) {
      console.warn('Could not read local tickets database for update:', e.message);
    }

    ticketsData[ticketId] = {
      status: status || 'Pending',
      comment: comment || '',
      updatedBy: updatedBy || 'Admin',
      updatedAt: new Date().toISOString()
    };

    try {
      fs.writeFileSync(ticketsPath, JSON.stringify(ticketsData, null, 2), 'utf-8');
      console.log(`Updated ticket ${ticketId} status to ${status} and saved.`);
      return res.json({ status: 'ok', ticket: ticketsData[ticketId] });
    } catch (error: any) {
      console.error('Failed to write local tickets registry:', error);
      return res.status(500).json({ error: error.message || 'Failed to update ticket' });
    }
  });

  app.get('/api/proxy-csv', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Failed to fetch from target URL. Status: ${response.status}`,
        });
      }
      const contentType = response.headers.get('content-type') || 'text/csv';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      const text = await response.text();
      return res.send(text);
    } catch (error: any) {
      console.error('Error in CSV proxy handler:', error);
      return res.status(500).json({
        error: `Server failed to proxy the request: ${error.message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
