import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.json({ success: true });
}

  try {
    const { name, mimeType, base64Data } = req.body;

    if (!name || !mimeType || !base64Data) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // TEMP SUCCESS TEST
    return res.status(200).json({
      success: true,
      url: 'https://example.com/test-image.jpg'
    });

  } catch (err: any) {
    console.error(err);

    return res.status(500).json({
      error: err.message || 'Upload failed'
    });
  }
}
