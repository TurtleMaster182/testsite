// api/chat.js
// Serverless function (runs on Vercel). Keeps your Google API key secret
// and answers questions using your team's info below.

// ---- 1. EDIT THIS: put your real team info here ----

/*Only answer using the information below. If you don't know something,
say so and suggest the visitor email the team or check the contact page —
do not make up facts.
*/
const TEAM_CONTEXT = `
You are the support chatbot for Peppers Robotics, FTC Team #19044.

`
/*
TEAM INFO:
- Team name & number: Peppers #19044
- Meeting days/times: [FILL IN]
- Meeting location: [FILL IN]
- Contact email: [FILL IN]
- How to join the team: [FILL IN]
- Current season's game: [FILL IN]
- Sponsors: [FILL IN]
- Social media / socials: [FILL IN]
- Fundraising / donations info: [FILL IN]
- Notable achievements/awards: [FILL IN]
FAQ:
Q: When and where do you meet?
A: [FILL IN]

Q: How can I join the team?
A: [FILL IN]

Q: How can we sponsor or donate?
A: [FILL IN]

(Add as many Q&A pairs as you want — the more specific, the better the bot's answers.)
`;*/
// ---- end of section to edit ----
// Primary model and fallback models in order of priority
const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const trimmedMessages = messages.slice(-10);
    const contents = trimmedMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    let response = null;

    // Loop through fallback models if primary model returns 503 or errors
    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: TEAM_CONTEXT }] },
          contents: contents,
          generationConfig: { maxOutputTokens: 500 },
        }),
      });

      if (response.ok) {
        break; // Successfully connected to an available model
      }

      console.warn(`Model ${model} failed with status ${response.status}. Trying next fallback...`);
    }

    if (!response || !response.ok) {
      const errText = await response?.text();
      console.error('All Gemini API models failed:', errText);
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a moment.' });
    }

    // Set SSE stream headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }

    return res.end();
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}