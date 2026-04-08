export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const systemPrompt = `You are an AI assistant built into Storage Hero, a self-storage investment brokerage CRM used by a commercial real estate broker at Ripco Real Estate Corp.

Your job is to help the broker with deal intelligence tasks:
- Identifying property ownership (owner name, LLC/entity)
- Finding contact information for owners
- Drafting cold outreach emails
- Quick property underwriting summaries
- Pulling context on self-storage markets

When given an address or property, respond with structured intelligence in this exact JSON format:
{
  "ownerName": "string or null",
  "entity": "string or null (LLC/corp name if applicable)",
  "contactPath": "string — how to find/reach this owner",
  "emailDraft": "string — a ready-to-send cold outreach email",
  "marketNotes": "string — brief notes on the market/submarket",
  "nextAction": "string — the single best next step for the broker",
  "confidence": "high | medium | low",
  "disclaimer": "string — note about data accuracy"
}

Keep the email draft professional, concise, and self-storage investment focused. Sign emails from Brandon Greene, Ripco Real Estate Corp.
Always return valid JSON only — no markdown, no extra text.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message ?? 'API error' });

    const text = data.content?.[0]?.text ?? '';
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { raw: text };
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
