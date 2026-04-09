export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'No address provided' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    // ── Step 1: Identify county/state from address ──────────────────────────
    const geoRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Parse this address and return ONLY a JSON object, no markdown, no explanation:
Address: ${address}

{
  "streetAddress": "street portion only",
  "city": "city",
  "county": "county name without the word County",
  "state": "two-letter state abbreviation",
  "stateFull": "full state name",
  "zip": "zip code or null",
  "assessorUrl": "direct property search URL for this specific county assessor/appraiser (the search page, not homepage)",
  "assessorName": "official name of this county property appraiser office",
  "sosUrl": "Secretary of State LLC search URL for this state",
  "sosName": "name of the state SOS/LLC lookup site (e.g. Sunbiz for Florida)"
}`
        }]
      })
    });

    const geoData = await geoRes.json();
    const geoText = geoData.content?.[0]?.text ?? '{}';
    let geo = {};
    try { geo = JSON.parse(geoText); } catch { geo = {}; }

    // ── Step 2: Attempt county assessor scrape ──────────────────────────────
    let assessorResult = null;
    if (geo.assessorUrl) {
      try {
        const pageRes = await fetch(geo.assessorUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        });
        const html = await pageRes.text();
        // Check if we got real HTML content (not a blank JS-rendered page)
        if (html.length > 5000 && !html.includes('id="root"') && !html.includes('id="app"')) {
          assessorResult = { reachable: true, html: html.slice(0, 3000) };
        } else {
          assessorResult = { reachable: false, reason: 'JavaScript-rendered site' };
        }
      } catch {
        assessorResult = { reachable: false, reason: 'Could not connect' };
      }
    }

    // ── Step 3: Use Claude to extract owner from HTML (if we got it) ─────────
    let ownerInfo = null;
    if (assessorResult?.reachable && assessorResult.html) {
      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: `Extract property owner info from this county assessor HTML. Return ONLY JSON:
HTML snippet: ${assessorResult.html}

{ "ownerName": "string or null", "isLLC": true/false, "entityName": "LLC name if applicable or null" }`
          }]
        })
      });
      const extractData = await extractRes.json();
      const extractText = extractData.content?.[0]?.text ?? '{}';
      try { ownerInfo = JSON.parse(extractText); } catch { ownerInfo = null; }
    }

    // ── Step 4: Sunbiz / SOS lookup if LLC ──────────────────────────────────
    let sosResult = null;
    const entityToSearch = ownerInfo?.entityName;

    if (entityToSearch && geo.state === 'FL') {
      sosResult = await searchSunbiz(entityToSearch);
    } else if (entityToSearch && geo.state === 'GA') {
      sosResult = await searchGeorgiaSOS(entityToSearch, apiKey);
    } else if (entityToSearch && geo.state === 'TX') {
      sosResult = await searchTexasSOS(entityToSearch, apiKey);
    }

    // ── Step 5: Build facility card ─────────────────────────────────────────
    const card = {
      address: address,
      city: geo.city,
      county: geo.county,
      state: geo.state,
      stateFull: geo.stateFull,

      // Owner info
      ownerName: ownerInfo?.ownerName ?? null,
      entityName: ownerInfo?.entityName ?? null,
      isLLC: ownerInfo?.isLLC ?? false,

      // SOS / Sunbiz result
      registeredAgent: sosResult?.registeredAgent ?? null,
      registeredAgentAddress: sosResult?.registeredAgentAddress ?? null,
      entityStatus: sosResult?.entityStatus ?? null,
      sosDetailUrl: sosResult?.detailUrl ?? null,

      // Sources
      assessorName: geo.assessorName,
      assessorUrl: geo.assessorUrl,
      assessorScraped: assessorResult?.reachable ?? false,
      sosName: geo.sosName,
      sosUrl: geo.sosUrl,

      // Data source trail
      sources: [
        assessorResult?.reachable ? `Live: ${geo.assessorName}` : `Link: ${geo.assessorName}`,
        sosResult ? `Live: ${geo.sosName}` : null,
      ].filter(Boolean),
    };

    res.status(200).json(card);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Sunbiz scraper (Florida) ──────────────────────────────────────────────────
async function searchSunbiz(entityName) {
  try {
    const encoded = encodeURIComponent(entityName.trim());
    const searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquirytype=EntityName&inquiryDirectionType=ForwardList&searchNameOrder=&masterFileKey=&inquiryIsDomesticEntity=N&searchTerm=${encoded}`;

    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    const searchHtml = await searchRes.text();

    // Find first result detail link
    const linkMatch = searchHtml.match(/href="(\/Inquiry\/CorporationSearch\/SearchResultDetail[^"]+)"/);
    if (!linkMatch) return null;

    const detailUrl = `https://search.sunbiz.org${linkMatch[1]}`;
    const detailRes = await fetch(detailUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    const detailHtml = await detailRes.text();

    // Extract registered agent name
    const agentSection = detailHtml.match(/Registered Agent[^<]*<\/span>([\s\S]{0,600})/i);
    const agentName = agentSection?.[1]?.match(/<span[^>]*>([^<]+)<\/span>/)?.[1]?.trim() ?? null;

    // Extract registered agent address
    const agentAddr = agentSection?.[1]?.match(/(?:span[^>]*>[^<]+<\/span>\s*){1}([\s\S]{0,200})/)?.[0]
      ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) ?? null;

    // Extract status
    const statusMatch = detailHtml.match(/Current Status[^<]*<\/span>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);

    return {
      registeredAgent: agentName,
      registeredAgentAddress: agentAddr,
      entityStatus: statusMatch?.[1]?.trim() ?? null,
      detailUrl,
    };
  } catch {
    return null;
  }
}

// ── Georgia SOS scraper ────────────────────────────────────────────────────────
async function searchGeorgiaSOS(entityName, apiKey) {
  try {
    const encoded = encodeURIComponent(entityName.trim());
    const url = `https://ecorp.sos.ga.gov/BusinessSearch?businessName=${encoded}&businessType=LLC&businessStatus=Active&county=&registered_agent=&principalName=&businessNameType=Contains&pageNumber=0`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    if (html.length < 1000) return null;

    // Use Claude to extract agent info from HTML
    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Extract registered agent from Georgia SOS HTML. Return ONLY JSON:
HTML: ${html.slice(0, 2000)}
{ "registeredAgent": "name or null", "entityStatus": "status or null", "detailUrl": "full URL to entity detail page or null" }`
        }]
      })
    });
    const extractData = await extractRes.json();
    const text = extractData.content?.[0]?.text ?? '{}';
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  }
}

// ── Texas SOS scraper ──────────────────────────────────────────────────────────
async function searchTexasSOS(entityName, apiKey) {
  try {
    const encoded = encodeURIComponent(entityName.trim());
    const url = `https://mycpa.cpa.state.tx.us/coa/coaSearchBtn?name=${encoded}&type=LLC`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();

    if (html.length < 500) return null;

    const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Extract registered agent from Texas SOS HTML. Return ONLY JSON:
HTML: ${html.slice(0, 2000)}
{ "registeredAgent": "name or null", "entityStatus": "status or null", "detailUrl": "full URL or null" }`
        }]
      })
    });
    const extractData = await extractRes.json();
    const text = extractData.content?.[0]?.text ?? '{}';
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  }
}
