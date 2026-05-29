import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

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

  // =========================
  // VERCEL SAFE STORAGE
  // =========================
  const uploadsDir = '/tmp/uploads';

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.use('/uploads', express.static(uploadsDir));

  const TOKEN_FILE_PATH = '/tmp/google-token.json';

  let currentAccessToken: string | null = null;
  let tokenSavedAt: string | null = null;

  function loadStoredToken() {
    try {
      if (fs.existsSync(TOKEN_FILE_PATH)) {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf-8'));
        if (data?.accessToken) {
          currentAccessToken = data.accessToken;
          tokenSavedAt = data.savedAt || new Date().toISOString();
          console.log('Loaded stored Google token.');
        }
      }
    } catch (error) {
      console.warn('Failed to load token:', error);
    }
  }

  loadStoredToken();

  // =========================
  // HEALTH CHECK
  // =========================
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // =========================
  // TOKEN ROUTES
  // =========================
  app.get('/api/sheets/token-status', (req, res) => {
    res.json({
      authenticated: !!currentAccessToken,
      savedAt: tokenSavedAt,
    });
  });

  app.post('/api/sheets/save-token', (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing accessToken' });
    }

    currentAccessToken = accessToken;
    tokenSavedAt = new Date().toISOString();

    try {
      fs.writeFileSync(
        TOKEN_FILE_PATH,
        JSON.stringify({ accessToken, savedAt: tokenSavedAt }, null, 2)
      );
    } catch (e) {
      console.error('Token save failed:', e);
    }

    res.json({ status: 'ok' });
  });

  // =========================
  // APPEND TO SHEET
  // =========================
  app.post('/api/sheets/append', async (req, res) => {
    let { range, values } = req.body;

    if (!SPREADSHEET_ID || !range || !values) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const localLogsPath = path.join(process.cwd(), 'local-logs.json');
    let localLogs: any[] = [];

    if (fs.existsSync(localLogsPath)) {
      localLogs = JSON.parse(fs.readFileSync(localLogsPath, 'utf-8'));
    }

    if (Array.isArray(values)) {
      localLogs.push(...values);
    }

    fs.writeFileSync(localLogsPath, JSON.stringify(localLogs, null, 2));

    const webhookUrl =
      'https://script.google.com/macros/s/AKfycbzavHfRHlnQcaXGglzV3ogI5x2ylqeGgCu0Ujz5XZHkgBI621MhrKJLIqzo-QbHjIkY/exec';

    let webhookSuccess = false;
    let webhookNotes = '';

    try {
      const payload = {
        action: 'append',
        spreadsheetId: SPREADSHEET_ID,
        range,
        values: values[0],
      };

      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await r.text();

      if (r.ok) {
        webhookSuccess = true;
        webhookNotes = 'Saved via webhook';
      } else {
        webhookNotes = text;
      }
    } catch (e: any) {
      webhookNotes = e.message;
    }

    if (webhookSuccess) {
      return res.json({ status: 'ok', notes: webhookNotes });
    }

    if (!currentAccessToken) {
      return res.json({ status: 'ok', notes: 'Local backup only' });
    }

    try {
      const gRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
          range
        )}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values }),
        }
      );

      const data = await gRes.json();
      return res.json(data);
    } catch (e: any) {
      return res.json({ status: 'ok', notes: e.message });
    }
  });

  // =========================
  // VALUES FETCH
  // =========================
  app.get('/api/sheets/values', async (req, res) => {
    const range = req.query.range as string;

    if (!range) {
      return res.status(400).json({ error: 'Missing range' });
    }

    try {
      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(
          range
        )}`,
        {
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
          },
        }
      );

      const data = await r.json();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // =========================
  // UPLOAD FILE (FIXED)
  // =========================
  app.post('/api/sheets/upload-file', async (req, res) => {
    const { name, mimeType, base64Data } = req.body;

    if (!name || !mimeType || !base64Data) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    try {
      const safeName = name.replace(/[^a-zA-Z0-9_\.-]/g, '_');

      const filePath = path.join('/tmp/uploads', safeName);

      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');

      const url = `${protocol}://${host}/uploads/${safeName}`;

      return res.json({
        id: url,
        url,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // =========================
  // VITE
  // =========================
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
