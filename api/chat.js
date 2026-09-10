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
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
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

    // Per-attempt timeout so one hung/slow model can't eat the whole
    // function's execution budget and cause an upstream 504.
    const PER_MODEL_TIMEOUT_MS = 8000;

    let geminiRes = null;
    let lastErrorDetail = '';

    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PER_MODEL_TIMEOUT_MS);

      try {
        geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: TEAM_CONTEXT }] },
            contents: contents,
            generationConfig: { maxOutputTokens: 500 },
          }),
          signal: controller.signal,
        });

        if (geminiRes.ok) {
          clearTimeout(timeoutId);
          break;
        }

        // Read the error body so we can tell auth errors (400/401/403 —
        // retrying with another model won't help) from transient/rate-limit
        // errors (429/5xx — worth trying the next model).
        const status = geminiRes.status;
        let bodyText = '';
        try { bodyText = await geminiRes.text(); } catch (_) {}
        lastErrorDetail = `[${model}] HTTP ${status}: ${bodyText.slice(0, 300)}`;
        console.error('Gemini request failed:', lastErrorDetail);

        if (status === 400 || status === 401 || status === 403) {
          // Bad API key, bad request shape, or permission issue.
          // No point burning time retrying every model.
          clearTimeout(timeoutId);
          geminiRes = null;
          break;
        }
      } catch (err) {
        lastErrorDetail = `[${model}] ${err.name === 'AbortError' ? 'timed out' : err.message}`;
        console.error('Gemini request error:', lastErrorDetail);
        geminiRes = null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      console.error('All model attempts failed. Last error:', lastErrorDetail);
      return new Response(JSON.stringify({ error: 'Service temporarily unavailable.', detail: lastErrorDetail }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Re-stream Gemini's SSE output as clean, single-line "data: {json}\n\n"
    // events. Gemini's raw SSE can pretty-print JSON across multiple lines,
    // which breaks naive line-by-line client parsers. Buffering and
    // re-emitting here guarantees one compact JSON object per event.
    const geminiReader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';

        function flushEvent(rawDataLines) {
          const jsonStr = rawDataLines.join('\n').trim();
          if (!jsonStr) return;
          try {
            const parsed = JSON.parse(jsonStr);
            const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textChunk) {
              const payload = JSON.stringify({ text: textChunk });
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }
          } catch (e) {
            // Incomplete/invalid JSON for this event; drop it.
          }
        }

        try {
          while (true) {
            const { done, value } = await geminiReader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // SSE events are separated by a blank line ("\n\n").
            let sepIndex;
            while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
              const rawEvent = buffer.slice(0, sepIndex);
              buffer = buffer.slice(sepIndex + 2);

              // Each event may have multiple lines; keep only "data: " lines,
              // strip the prefix, and rejoin (handles multi-line JSON).
              const dataLines = rawEvent
                .split('\n')
                .filter((l) => l.startsWith('data: '))
                .map((l) => l.slice(6));

              if (dataLines.length) flushEvent(dataLines);
            }
          }

          // Flush any trailing event without a final blank-line separator.
          if (buffer.trim()) {
            const dataLines = buffer
              .split('\n')
              .filter((l) => l.startsWith('data: '))
              .map((l) => l.slice(6));
            if (dataLines.length) flushEvent(dataLines);
          }
        } catch (e) {
          console.error('Stream error:', e);
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
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