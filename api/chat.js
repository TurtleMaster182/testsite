// api/chat.js
// Serverless function (runs on Vercel). Keeps your Google API key secret
// and answers questions using your team's info below.

// ---- 1. EDIT THIS: put your real team info here ----

/*Only answer using the information below. If you don't know something,
say so and suggest the visitor email the team or check the contact page —
do not make up facts.
*/
const TEAM_CONTEXT = `
You are the support chatbot for [YOUR TEAM NAME], FTC Team #[NUMBER].

TEAM INFO:
- Team name & number: [FILL IN]
- Meeting days/times: [FILL IN]
- Meeting location: [FILL IN]
- Contact email: [FILL IN]
- How to join the team: [FILL IN]
- Current season's game: [FILL IN]
- Sponsors: [FILL IN]
- Social media / socials: [FILL IN]
- Fundraising / donations info: [FILL IN]
- Notable achievements/awards: [FILL IN]
`
/*
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

export default async function handler(req, res) {
  // Basic CORS so your static site can call this function
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Keep conversation history short to control cost
    const trimmedMessages = messages.slice(-10);

    // Map chat history into Google Gemini's contents format (roles must be 'user' or 'model')
    const contents = trimmedMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: TEAM_CONTEXT }],
        },
        contents: contents,
        generationConfig: {
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await response.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I couldn't generate a response.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}