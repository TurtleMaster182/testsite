// api/chat.js
// Serverless function (runs on Vercel). Keeps your Google API key secret
// and answers questions using your team's info below.

// ---- 1. EDIT THIS: put your real team info here ----

const TEAM_CONTEXT = `
Only answer using the information below. If you don't know something,
say so and suggest the visitor email the team or check the contact page —
do not make up facts.

You are the support chatbot for Peppers Robotics, FTC Team #19044.

TEAM INFO:
- Team name & number: Peppers #19044
- Founded in 2019, rokie year 2020
- Meeting days/times: MARTI, 8 PM
- Meeting location: SCHOOL / ONLINE
- Contact email: mailul.lui@alex.trust
- How to join the team: google forms
- Current season's game: BIOBUZ SEASON 11
- Social media / socials: TIKTOK, INSTAGRAM, FACEBOOK
- Fundraising / donations info: ask cristi
- Notable achievements/awards: Inovate at kickoff
- best programmer, and mechanic (this season): Adochitei Andrei
- Boeriu is actually called Femboer
`;
// ---- end of section to edit ----
// Primary model and fallback models in order of priority
const MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
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
    // Tracks the error from the CURRENT attempt only — reset at the top of
    // every loop iteration so a later model's outcome (success, or a
    // different failure) never gets described using a previous model's
    // stale error. lastErrorDetail below always reflects the most recent
    // attempt made, which is what gets surfaced if every attempt fails.
    let lastErrorDetail = '';
    let lastErrorStatus = null; // upstream HTTP status of the last failed attempt, if any

    for (const model of MODELS) {
      // Reset per-attempt state so nothing leaks from the previous model.
      lastErrorDetail = '';
      lastErrorStatus = null;

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
          // Success — clear any leftover error state from earlier models
          // that failed before this one succeeded.
          lastErrorDetail = '';
          lastErrorStatus = null;
          break;
        }

        // Read the error body so we can tell auth errors (400/401/403 —
        // retrying with another model won't help) from transient/rate-limit
        // errors (429/5xx — worth trying the next model).
        const status = geminiRes.status;
        let bodyText = '';
        try { bodyText = await geminiRes.text(); } catch (_) {}
        lastErrorStatus = status;
        lastErrorDetail = `[${model}] HTTP ${status}: ${bodyText.slice(0, 300)}`;
        console.error('Gemini request failed:', lastErrorDetail);

        if (status === 400 || status === 401 || status === 403) {
          // Bad API key, bad request shape, or permission issue.
          // No point burning time retrying every model.
          clearTimeout(timeoutId);
          geminiRes = null;
          break;
        }

        // 429 / 5xx / other transient error — clear geminiRes so the loop's
        // final check doesn't mistake this failed response for success, and
        // move on to try the next model.
        geminiRes = null;
      } catch (err) {
        lastErrorStatus = err.name === 'AbortError' ? 504 : null;
        lastErrorDetail = `[${model}] ${err.name === 'AbortError' ? 'timed out' : err.message}`;
        console.error('Gemini request error:', lastErrorDetail);
        geminiRes = null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!geminiRes) {
      console.error('All model attempts failed. Last error:', lastErrorDetail);

      // Map the last upstream status to something meaningful for the
      // client instead of a single generic "unavailable" for every case.
      let clientStatus = 503;
      let clientMessage = 'Service temporarily unavailable. Please try again in a moment.';
      if (lastErrorStatus === 429) {
        clientStatus = 429;
        clientMessage = 'The assistant is getting a lot of requests right now. Please try again shortly.';
      } else if (lastErrorStatus === 400 || lastErrorStatus === 401 || lastErrorStatus === 403) {
        clientStatus = 502;
        clientMessage = 'The assistant is misconfigured. Please contact the team.';
      } else if (lastErrorStatus === 504 || (lastErrorStatus === null && /timed out/.test(lastErrorDetail))) {
        clientStatus = 504;
        clientMessage = 'The assistant took too long to respond. Please try again.';
      } else if (typeof lastErrorStatus === 'number' && lastErrorStatus >= 500) {
        clientStatus = 502;
        clientMessage = 'The assistant service is having issues right now. Please try again shortly.';
      }

      return new Response(JSON.stringify({ error: clientMessage, detail: lastErrorDetail }), {
        status: clientStatus,
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
            // Gemini sends CRLF line endings ("\r\n\r\n" between events),
            // not bare "\n\n". Normalize to "\n" so all the splitting logic
            // below (which assumes Unix line endings) works regardless of
            // which the upstream API actually sends.
            buffer = buffer.replace(/\r\n/g, '\n');
            console.log('RAW CHUNK FROM GEMINI:', JSON.stringify(buffer));

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