const ALLOWED = [
  'https://s4l4ry.com',
  'https://www.s4l4ry.com',
  'https://dinememento.com',
  'https://www.dinememento.com',
  'https://paply.me',
  'https://www.paply.me',
];

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) return res.status(400).send('Missing url param');

  let parsed;
  try { parsed = new URL(url); }
  catch { return res.status(400).send('Invalid url'); }

  const isAllowed = ALLOWED.some(a => url.startsWith(a));
  if (!isAllowed) return res.status(403).send('Domain not allowed');

  const origin = parsed.origin;

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Safari";v="17"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"iOS"',
      },
      redirect: 'follow',
    });

    let html = await upstream.text();

    // Rewrite root-relative URLs → absolute so assets load from the real origin
    html = html
      .replace(/((?:href|src|action|srcset)=["'])\/(?!\/)/g, `$1${origin}/`)
      .replace(/url\(["']?\/(?!\/)/g, `url(${origin}/`);

    // Rewrite protocol-relative URLs
    html = html.replace(/((?:href|src|action)=["'])(\/\/)/g, `$1https://`);

    // Strip CSP and X-Frame-Options meta tags
    html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
    html = html.replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, '');

    // Strip common JS frame-busting patterns
    html = html.replace(/if\s*\(\s*(?:window\.top|window\.self|top|self)\s*[!=]==?\s*(?:window\.top|window\.self|top|self|window)\s*\)[^}]*}/gi, '');
    html = html.replace(/(?:top|window\.top)\.location(?:\.href)?\s*=\s*(?:self|window\.self|window)\.location(?:\.href)?/gi, '');

    // Inject safety script + base tag immediately after <head> — must run FIRST
    const safeScript = `<script>try{window.onerror=function(){return true};window.addEventListener('error',function(e){e.preventDefault();e.stopPropagation()},true);window.addEventListener('unhandledrejection',function(e){e.preventDefault()},true);Object.defineProperty(window,'top',{get:function(){return window}});Object.defineProperty(window,'parent',{get:function(){return window}})}catch(e){}</script>`;
    const baseTag = `<base href="${origin}/">`;
    html = html.replace(/<head([^>]*)>/i, `<head$1>${safeScript}${baseTag}`);

    // Serve without frame-busting headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.status(upstream.status).send(html);
  } catch (err) {
    res.status(502).send('Proxy fetch failed: ' + err.message);
  }
}
