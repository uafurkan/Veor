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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    let html = await upstream.text();

    // Rewrite root-relative URLs → absolute so assets load from the real origin
    html = html
      .replace(/((?:href|src|action|srcset)=["'])\/(?!\/)/g, `$1${origin}/`)
      .replace(/url\(["']?\/(?!\/)/g, `url(${origin}/`);

    // Inject <base> so any remaining relative links resolve correctly
    const baseTag = `<base href="${origin}/">`;
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);

    // Serve without frame-busting headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    res.status(upstream.status).send(html);
  } catch (err) {
    res.status(502).send('Proxy fetch failed: ' + err.message);
  }
}
