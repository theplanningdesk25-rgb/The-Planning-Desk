// The Planning Desk — site Worker.
// Serves the static site and handles lead-form submissions at POST /api/lead.
// Leads are emailed via Resend to leads@the-planning-desk.com.
// The Resend key lives in the RESEND_API_KEY secret (set in the dashboard or
// with `wrangler secret put RESEND_API_KEY`) and is never committed.

const LEAD_TO = 'leads@the-planning-desk.com';
const LEAD_FROM = 'The Planning Desk <leads@the-planning-desk.com>';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      return handleLead(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

async function handleLead(request, env) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'bad request' }, 400); }

  // Honeypot: real users leave this blank. Accept silently so bots get no signal.
  if (data._gotcha) return json({ ok: true });

  if (!env.RESEND_API_KEY) return json({ error: 'not configured' }, 503);

  const clean = v => String(v == null ? '' : v).slice(0, 4000);
  const email = clean(data.email).slice(0, 200);
  const name = clean(data.name).slice(0, 200);
  const company = clean(data.company).slice(0, 200);
  const source = clean(data.source) || 'website';

  const body = Object.entries(data)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `${k}: ${clean(v)}`)
    .join('\n');

  const subject = `New lead (${source}): ${company || name || email || 'website'}`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: LEAD_FROM,
        to: [LEAD_TO],
        reply_to: email || undefined,
        subject,
        text: body
      })
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return json({ error: 'send failed', detail }, 502);
    }
  } catch (e) {
    return json({ error: 'send error' }, 502);
  }
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
