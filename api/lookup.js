export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'No address provided' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    // ── Step 1: Ask Claude to identify county + build assessor search URL ────
    const geoRes = await callClaude(apiKey, 'claude-haiku-4-5-20251001', 512, `You are a US property research assistant.

Given this address: "${address}"

Return ONLY a JSON object (no markdown):
{
  "streetAddress": "street number and name only",
  "city": "city",
  "county": "county name without the word County",
  "state": "two-letter state code",
  "stateFull": "full state name",
  "zip": "zip or null",
  "assessorSearchUrl": "the direct property search URL for this county assessor/appraiser with the address pre-filled as a query parameter if possible, otherwise the search page URL",
  "assessorName": "official name of this county property appraiser/assessor office",
  "sosName": "name of the state LLC lookup site e.g. Sunbiz for Florida, Georgia Corporations Division for Georgia, Texas SOS for Texas",
  "sosSearchUrl": "the base search URL for this state's LLC/entity lookup"
}`);

    let geo = {};
    try { geo = JSON.parse(geoRes); } catch { geo = {}; }

    if (!geo.assessorSearchUrl) {
      return res.status(200).json({
        address, error: 'Could not identify county assessor URL',
        county: geo.county, state: geo.state, stateFull: geo.stateFull,
      });
    }

    // ── Step 2: Fetch assessor page via Jina AI Reader (renders JS) ──────────
    const jinaUrl = `https://r.jina.ai/${geo.assessorSearchUrl}`;
    let assessorText = '';
    try {
      const jinaRes = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Timeout': '15',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(20000),
      });
      assessorText = await jinaRes.text();
    } catch (e) {
      assessorText = '';
    }

    // ── Step 3: Claude extracts owner name from assessor content ─────────────
    let ownerInfo = { ownerName: null, entityName: null, isLLC: false };
    if (assessorText.length > 200) {
      const extractRaw = await callClaude(apiKey, 'claude-haiku-4-5-20251001', 256,
        `Extract the property owner information from this county assessor page content.
The property address is: ${address}

Page content:
${assessorText.slice(0, 4000)}

Return ONLY JSON:
{
  "ownerName": "full owner name as listed on the assessor record, or null if not found",
  "entityName": "LLC or company name if the owner is a business entity, or null",
  "isLLC": true or false
}`);
      try { ownerInfo = JSON.parse(extractRaw); } catch {}
    }

    // ── Step 4: If LLC, cross-reference Sunbiz or state SOS via Jina ────────
    let sosResult = null;
    const entityToLookup = ownerInfo.entityName ?? (ownerInfo.isLLC ? ownerInfo.ownerName : null);

    if (entityToLookup) {
      sosResult = await lookupSOS(entityToLookup, geo.state, geo.sosSearchUrl, apiKey);
    }

    // ── Step 5: Return facility card data ────────────────────────────────────
    res.status(200).json({
      address,
      city: geo.city,
      county: geo.county,
      state: geo.state,
      stateFull: geo.stateFull,

      ownerName: ownerInfo.ownerName,
      entityName: ownerInfo.entityName,
      isLLC: ownerInfo.isLLC,

      registeredAgent: sosResult?.registeredAgent ?? null,
      registeredAgentAddress: sosResult?.registeredAgentAddress ?? null,
      entityStatus: sosResult?.entityStatus ?? null,
      sosDetailUrl: sosResult?.detailUrl ?? null,

      assessorName: geo.assessorName,
      assessorUrl: geo.assessorSearchUrl,
      assessorScraped: assessorText.length > 200,
      sosName: geo.sosName,
      sosUrl: geo.sosSearchUrl,

      sources: [
        assessorText.length > 200
          ? `Live: ${geo.assessorName}`
          : `Link: ${geo.assessorName}`,
        sosResult ? `Live: ${geo.sosName}` : null,
      ].filter(Boolean),
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── SOS lookup via Jina + Claude ───────────────────────────────────────────────
async function lookupSOS(entityName, stateCode, sosBaseUrl, apiKey) {
  try {
    let searchUrl = '';

    if (stateCode === 'FL') {
      const encoded = encodeURIComponent(entityName.trim());
      searchUrl = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquirytype=EntityName&inquiryDirectionType=ForwardList&searchNameOrder=&masterFileKey=&inquiryIsDomesticEntity=N&searchTerm=${encoded}`;
    } else if (stateCode === 'GA') {
      const encoded = encodeURIComponent(entityName.trim());
      searchUrl = `https://ecorp.sos.ga.gov/BusinessSearch?businessName=${encoded}&businessType=&businessStatus=A&county=&registered_agent=&principalName=&businessNameType=Contains&pageNumber=0`;
    } else if (stateCode === 'TX') {
      const encoded = encodeURIComponent(entityName.trim());
      searchUrl = `https://mycpa.cpa.state.tx.us/coa/coaSearchBtn?name=${encoded}&type=LLC&status=A`;
    } else {
      // Generic: use the base SOS URL
      searchUrl = sosBaseUrl ?? '';
    }

    if (!searchUrl) return null;

    // Fetch via Jina
    const jinaUrl = `https://r.jina.ai/${searchUrl}`;
    const jinaRes = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-Timeout': '15' },
      signal: AbortSignal.timeout(20000),
    });
    const sosText = await jinaRes.text();

    if (sosText.length < 100) return null;

    // Claude extracts registered agent from SOS text
    const extractRaw = await callClaude(apiKey, 'claude-haiku-4-5-20251001', 256,
      `Extract LLC/entity registration info from this state SOS page content.
Looking for entity: "${entityName}"

Page content:
${sosText.slice(0, 4000)}

Return ONLY JSON:
{
  "registeredAgent": "registered agent full name or null",
  "registeredAgentAddress": "registered agent address or null",
  "entityStatus": "Active / Inactive / etc or null",
  "detailUrl": "full URL to the entity detail page if visible in the content, or null"
}`);

    try { return JSON.parse(extractRaw); } catch { return null; }

  } catch {
    return null;
  }
}

// ── Claude API helper ──────────────────────────────────────────────────────────
async function callClaude(apiKey, model, maxTokens, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}
