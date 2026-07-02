// Catch-all upstream proxy: serves the framework's runtime requests
// (/_next/* chunks, /api/auth/session, RSC fetches, fonts...) that the
// proxied page issues against OUR origin. The upstream host comes from
// the veor_up cookie set by /api/proxy when it serves the HTML.

const ALLOWED_HOSTS = [
  'paply.me', 'www.paply.me',
  's4l4ry.com', 'www.s4l4ry.com',
  'dinememento.com', 'www.dinememento.com',
];

export const config = { api: { bodyParser: false } };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : null));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)veor_up=([^;]+)/);
  const host = m ? decodeURIComponent(m[1]) : null;
  if (!host || !ALLOWED_HOSTS.includes(host)) {
    return res.status(404).send('Not found');
  }

  // Rebuild the original path (+query) from the rewrite param __vp
  const { __vp = '', ...rest } = req.query;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    if (Array.isArray(v)) v.forEach(x => qs.append(k, x));
    else qs.append(k, v);
  }
  const path = Array.isArray(__vp) ? __vp.join('/') : __vp;
  const search = qs.toString();
  const url = `https://${host}/${path}${search ? '?' + search : ''}`;

  try {
    const init = {
      method: req.method,
      redirect: 'follow',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      },
    };
    if (req.headers['content-type']) init.headers['Content-Type'] = req.headers['content-type'];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = await readBody(req);
      if (body) init.body = body;
    }

    const upstream = await fetch(url, init);
    const buf = Buffer.from(await upstream.arrayBuffer());

    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    // Static chunks are immutable — cache hard; everything else stays fresh
    if (path.startsWith('_next/static/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      const cc = upstream.headers.get('cache-control');
      res.setHeader('Cache-Control', cc || 'no-store');
    }

    res.status(upstream.status).send(buf);
  } catch (err) {
    res.status(502).send('Fallback proxy failed: ' + err.message);
  }
}
