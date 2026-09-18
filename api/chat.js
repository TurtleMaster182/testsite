// api/chat.js
// Serverless function (runs on Vercel). Keeps your Google API key secret
// and answers questions using your team's info below.

// ---- 1. EDIT THIS: put your real team info here ----
//
// Structured so each part of the team's info lives in its own section
// instead of one giant string. This makes it much easier to find and
// update a single fact (e.g. just the roster, or just this season's
// sponsors) without scrolling through a wall of text. All sections are
// still sent together to the model — this is about maintainability, not
// about only sending some sections (that's a further optimization for
// later if the KB grows a lot).
//
// Any field still set to "[FILL IN]" is treated as genuinely unknown —
// the model is instructed below not to guess or invent a value for it.

const TEAM_INFO = {
  basics: {
    name: 'Peppers #19044',
    location: 'Iași, Iași County, Romania',
    school: 'Liceul Teoretic de Informatică „Grigore Moisil" Iași (Theoretical High School of Computer Science "Grigore Moisil")',
    rookieYear: '2020',
    website: 'peppers-robotics.ro',
    slogan: 'More than robots, we\'re building tomorrow.',
    meetingDaysTimes: 'Tuesdays, 8 PM',
    meetingLocation: 'At school, and online',
    contactEmail: '[FILL IN]', // placeholder given ("mailul.lui@alex.trust") isn't a usable real address
    howToJoin: 'Fill out the team\'s Google Form (linked on the team website / social media when recruitment is open)',
    currentSeasonGame: '[FILL IN]', // "BIOBUZ SEASON 11" doesn't match a real FTC season name; per team history the most recent listed season is DECODE (2025-26)
    socials: 'TikTok, Instagram, Facebook',
    fundraisingInfo: '[FILL IN]', // "ask cristi" isn't something a visitor can act on directly — fill in an actual process/contact
  },

  // One entry per notable achievement/award. Add or remove freely.
  achievements: [
    { season: '2022', title: 'Motivate Award, 2nd Place — FIRST Championship, Houston (Franklin Division)' },
    { season: '2022', title: 'Inspire Award, 2nd Place — Romanian National Championship' },
    { season: '2022', title: 'Finalist Alliance, 1st Team Selected — Romanian National Championship' },
    { season: '2022', title: 'Winning Alliance, 1st Team Selected — Bucharest Qualifying Tournament' },
    { season: '2022', title: 'Innovate Award (sponsored by Raytheon Technologies), 2nd Place — Bucharest Qualifying Tournament' },
    { season: '2023', title: 'Semifinalist, Franklin Division — FIRST Championship, Houston' },
    { season: '2024', title: 'Winning Alliance, 1st Team Selected — East Romania League Tournament' },
    { season: '2024', title: 'Connect Award, 3rd Place — East Romania League Tournament' },
    { season: '2025-26', title: 'Sustain Award — Romania East League Tournament' },
    { season: '2025-26', title: 'Sustain Award — Istanbul Premier Event, Rumeli Division' },
  ],

  // One entry per sponsor. Add or remove freely.
  sponsors: [
    // { name: 'Local Foundry Co', note: 'Provides machining time' },
  ],

  // One entry per team member you want the bot to be able to talk about.
  // Keep this only as detailed as you're comfortable with a public bot
  // repeating to strangers.
  roster: [
    // { name: 'Jane Doe', role: 'Mechanical Lead' },
  ],

  // One entry per season, oldest or newest first — your call, order here
  // doesn't matter to the model.
  seasons: [
    { years: '2020', tag: 'Rookie season', summary: 'Competed in ULTIMATE GOAL.' },
    { years: '2021', tag: '', summary: 'Competed in FREIGHT FRENZY.' },
    { years: '2022', tag: 'Standout season', summary: 'Competed in POWERPLAY — Motivate Award 2nd Place at FIRST Championship (Franklin Division), Inspire Award 2nd Place and Finalist Alliance at Romanian National Championship, Winning Alliance and Innovate Award 2nd Place at Bucharest Qualifying Tournament.' },
    { years: '2023', tag: '', summary: 'Competed in CENTERSTAGE — reached the semifinals of the Franklin Division at the FIRST Championship in Houston.' },
    { years: '2024', tag: '', summary: 'Competed in INTO THE DEEP — Winning Alliance (1st team selected) and Connect Award 3rd Place at the East Romania League Tournament.' },
    { years: '2025-26', tag: 'Current season', summary: 'Competing in DECODE — Sustain Award at the Romania East League Tournament and at the Istanbul Premier Event (Rumeli Division). Finished 16th of 31 in qualifications at the Romania East League Tournament and 16th of 48 in the VLAICU Division at the 2026 Romania Championship.' },
  ],

  // Freeform Q&A pairs. The most specific and complete these are, the
  // better the bot's answers — this is the highest-value section to fill in.
  faq: [
    { q: 'When and where do you meet?', a: 'Tuesdays at 8 PM, at school and online.' },
    { q: 'How can I join the team?', a: 'Fill out the team\'s Google Form (shared on the website and social media when recruitment is open).' },
    { q: 'How can we sponsor or donate?', a: '[FILL IN]' },
    { q: 'What is Peppers\' FTC team number?', a: '19044.' },
    { q: 'Where is the team based?', a: 'Iași, Romania, at Liceul Teoretic de Informatică „Grigore Moisil" (Theoretical High School of Computer Science "Grigore Moisil").' },
    { q: 'What is Peppers\' rookie year?', a: '2020, per FIRST\'s official team record. The team\'s own materials describe having existed for about 7 years with 120+ student contributors, so treat both figures as context rather than a single exact founding date.' },
    { q: 'What outreach or community programs does Peppers run?', a: 'Several, including Peppers STEM Special (STEM demos for younger students), Dăruiește un robot (robotics/electronics/programming education for under-resourced schools), RoboReach (STEM outreach for students with disabilities), LIIS STEM Junior (Arduino education for middle schoolers), House of Rookies (recruitment and intro training), PeppQuest (CAD/mechanics/programming training plus an Arduino build challenge), PeppTalks (interviews with students and mentors), PeppStrike (a recreational Counter-Strike 2 tournament among Romanian FTC teams), and AI vs Human Art (an event exploring technology, creativity and AI).' },
    { q: 'Is Peppers only a competition team?', a: 'No — Peppers describes itself as a student-and-alumni STEM community as much as a competitive FTC team, with a strong focus on outreach, education and mentoring alongside robot-building.' },
  ],
};

// ---- end of section to edit ----

// Assembles TEAM_INFO into the single system-instruction string Gemini
// actually receives. Edit TEAM_INFO above, not this function.
function buildTeamContext(info) {
  const lines = [];

  lines.push(
    "Only answer using the information below. If a fact is marked " +
    '"[FILL IN]" or a section is empty, you do NOT have that information — ' +
    'say so plainly and suggest the visitor email the team or check the ' +
    'contact page. Do not guess, infer, or invent any fact, including ' +
    'contact details, that is not explicitly present below. Season-specific ' +
    'details (robots, mechanisms, strategies, member roles) can change a ' +
    'lot between seasons, so do not treat them as permanent team traits.'
  );
  lines.push('');
  lines.push(`You are the support chatbot for ${info.basics.name}, an FTC robotics team.`);
  lines.push('');

  lines.push('TEAM INFO:');
  lines.push(`- Team name: ${info.basics.name}`);
  lines.push(`- Location: ${info.basics.location || '[FILL IN]'}`);
  lines.push(`- School: ${info.basics.school || '[FILL IN]'}`);
  lines.push(`- FTC rookie year: ${info.basics.rookieYear || '[FILL IN]'}`);
  lines.push(`- Website: ${info.basics.website || '[FILL IN]'}`);
  lines.push(`- Slogan: ${info.basics.slogan || '[FILL IN]'}`);
  lines.push(`- Meeting days/times: ${info.basics.meetingDaysTimes}`);
  lines.push(`- Meeting location: ${info.basics.meetingLocation}`);
  lines.push(`- Contact email: ${info.basics.contactEmail}`);
  lines.push(`- How to join the team: ${info.basics.howToJoin}`);
  lines.push(`- Current season's game: ${info.basics.currentSeasonGame}`);
  lines.push(`- Social media / socials: ${info.basics.socials}`);
  lines.push(`- Fundraising / donations info: ${info.basics.fundraisingInfo}`);
  lines.push('');

  if (info.achievements.length) {
    lines.push('NOTABLE ACHIEVEMENTS/AWARDS:');
    for (const a of info.achievements) {
      lines.push(`- ${a.season}: ${a.title}`);
    }
    lines.push('');
  }

  if (info.sponsors.length) {
    lines.push('SPONSORS:');
    for (const s of info.sponsors) {
      lines.push(`- ${s.name}${s.note ? ` — ${s.note}` : ''}`);
    }
    lines.push('');
  }

  if (info.roster.length) {
    lines.push('TEAM MEMBERS:');
    for (const m of info.roster) {
      lines.push(`- ${m.name}${m.role ? ` — ${m.role}` : ''}`);
    }
    lines.push('');
  }

  if (info.seasons.length) {
    lines.push('SEASON ARCHIVE:');
    for (const s of info.seasons) {
      lines.push(`- ${s.years}${s.tag ? ` (${s.tag})` : ''}: ${s.summary}`);
    }
    lines.push('');
  }

  if (info.faq.length) {
    lines.push('FAQ:');
    for (const item of info.faq) {
      lines.push(`Q: ${item.q}`);
      lines.push(`A: ${item.a}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

const TEAM_CONTEXT = buildTeamContext(TEAM_INFO);

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