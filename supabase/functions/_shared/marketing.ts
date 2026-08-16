// Shared helpers for the marketing email module — used by send-marketing-email
// and the public unsubscribe/open/click tracking Edge Functions.

export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function htmlPage(title: string, message: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body{font-family:Arial,sans-serif;background:#F8FAFC;color:#1C2127;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;}
    .box{max-width:420px;text-align:center;background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:36px 28px;}
    h1{font-size:18px;margin:0 0 10px;}
    p{font-size:14px;color:#64748B;margin:0;}
  </style></head>
  <body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// 1x1 transparent GIF, used by the open-tracking pixel.
export const TRACKING_PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'), c => c.charCodeAt(0));
