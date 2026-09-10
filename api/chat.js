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
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro'
];
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array is required' }), { status: 400 });
    }

    const trimmedMessages = messages.slice(-10);
    const contents = trimmedMessages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not configured');
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not set.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let geminiRes = null;

    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: TEAM_CONTEXT }] },
          contents: contents,
          generationConfig: { maxOutputTokens: 500 },
        }),
      });

      if (geminiRes.ok) break;
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable.' }), { status: 503 });
    }

    // Directly pipe the stream to the client with SSE headers
    return new Response(geminiRes.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}