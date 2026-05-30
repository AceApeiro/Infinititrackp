import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ✅ Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, mimeType, base64Data } = req.body;

    // ✅ Validate input
    if (!name || !mimeType || !base64Data) {
      return res.status(400).json({
        error: 'Missing required fields (name, mimeType, base64Data)'
      });
    }

    // 🧪 TEMP TEST RESPONSE (NO DRIVE YET)
    // This confirms your endpoint is working
    return res.status(200).json({
      success: true,
      message: 'Upload endpoint working',
      url: 'https://example.com/test-image.jpg'
    });

  } catch (err: any) {
    console.error('Upload error:', err);

    return res.status(500).json({
      error: err?.message || 'Upload failed'
    });
  }
}
