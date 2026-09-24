import { ClientError, jsonError, readMessages, reserveQuota } from '../lib/chat-security.mjs';

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
  // Browser boundary only; the shared quota also covers direct HTTP clients.
  const origin = req.headers.get('origin');
  if ((origin && origin !== new URL(req.url).origin) ||
      req.headers.get('sec-fetch-site') === 'cross-site') {
    return jsonError(403, 'Cross-origin requests are not allowed.');
  }
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed.', { Allow: 'POST' });

  let messages;
  try { messages = await readMessages(req); }
  catch (err) {
    return jsonError(err instanceof ClientError ? err.status : 400, err instanceof ClientError ? err.message : 'Invalid request.');
  }
  if (!process.env.GEMINI_API_KEY) return jsonError(503, 'Chat is temporarily unavailable.');
  try {
    const retryAfter = await reserveQuota();
    if (retryAfter) return jsonError(429, 'Chat usage limit reached. Please try again later.', { 'Retry-After': String(retryAfter) });
  } catch {
    return jsonError(503, 'Chat is temporarily unavailable.');
  }

  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }],
  }));
  let lastStatus = 503;
  for (const model of MODELS) {
    const controller = new AbortController();
    // Includes headers AND response streaming; never cleared just on HTTP 200.
    const timer = setTimeout(() => controller.abort(), 8000);
    const abort = () => controller.abort();
    req.signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      req.signal.removeEventListener('abort', abort);
    };
    try {
      if (req.signal.aborted) throw new Error('Disconnected');
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: TEAM_CONTEXT }] }, contents,
          generationConfig: { maxOutputTokens: 500 } }),
      });
      if (!upstream.ok || !upstream.body) {
        lastStatus = upstream.status === 429 ? 429 : 502;
        await upstream.body?.cancel();
        controller.abort();
        cleanup();
        if ([400, 401, 403].includes(upstream.status)) break;
        continue;
      }
      return streamReply(upstream, controller, cleanup);
    } catch {
      lastStatus = controller.signal.aborted ? 504 : 502;
      controller.abort();
      cleanup();
      if (req.signal.aborted) break;
    }
  }
  // Never return provider error bodies, configuration details, or credentials.
  return jsonError(lastStatus, 'Chat is temporarily unavailable. Please try again later.');
}

function streamReply(upstream, abortController, cleanup) {
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '', bytes = 0, outputChars = 0;
      const emit = data => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${data}\n\n`)); };
      function flushEvent(event) {
        const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
        if (!data || data === '[DONE]') return;
        const parsed = JSON.parse(data);
        const parts = parsed?.candidates?.[0]?.content?.parts || [];
        const text = parts.filter(part => typeof part.text === 'string').map(part => part.text).join('');
        outputChars += text.length;
        if (outputChars > 16000) throw new Error('Output limit');
        if (text) emit(JSON.stringify({ text }));
      }
      try {
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 262144) throw new Error('Stream limit');
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');
          let separator;
          while ((separator = buffer.indexOf('\n\n')) !== -1) {
            flushEvent(buffer.slice(0, separator));
            buffer = buffer.slice(separator + 2);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim() && !cancelled) flushEvent(buffer);
      } catch {
        emit(JSON.stringify({ error: 'The response was interrupted. Please try again.' }));
      } finally {
        abortController.abort();
        void reader.cancel().catch(() => {});
        cleanup();
        if (!cancelled) { emit('[DONE]'); controller.close(); }
      }
    },
    cancel() {
      cancelled = true;
      abortController.abort();
      void reader.cancel().catch(() => {});
      cleanup();
    },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no',
  } });
}
