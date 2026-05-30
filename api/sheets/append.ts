import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {

    const { range, values } = req.body;

    if (!range || !values) {
      return res.status(400).json({
        error: 'Missing range or values'
      });
    }

    // YOUR APPS SCRIPT WEBHOOK
    const webhookUrl =
      'https://script.google.com/macros/s/AKfycbwcZOnPH8qjplnjEQar4tnIbdnPclpa-detNowoWySTI19kibmA3FzfmqT9rTJ0gRdx/exec';

    const response = await fetch(webhookUrl,{
      method:'POST',
      headers:{
        'Content-Type':'application/json'
      },
      body: JSON.stringify({
        action:'append',
        range,
        values
      })
    });

    const text = await response.text();

    return res.status(response.status).send(text);

  } catch(err:any){

    return res.status(500).json({
      error: err.message
    });

  }

}
