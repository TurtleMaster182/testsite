export const MAX_BODY_BYTES = 32768;
export const MAX_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TOTAL_CHARS = 8000;

export class ClientError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function jsonError(status, message, extra = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...extra },
  });
}

export async function readMessages(req) {
  const encoding = req.headers.get('content-encoding');
  if (encoding && encoding !== 'identity') throw new ClientError(415, 'Compressed requests are not supported.');
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ClientError(415, 'Content-Type must be application/json.');
  }
  const declared = Number(req.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) throw new ClientError(413, 'Message payload is too large.');
  if (!req.body) throw new ClientError(400, 'A JSON body is required.');
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, raw = '';
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ClientError(408, 'Request body timed out.'));
      void reader.cancel().catch(() => {});
    }, 5000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new ClientError(413, 'Message payload is too large.');
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const body = JSON.parse(raw);
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
      throw new ClientError(400, 'Provide between 1 and 10 messages.');
    }
    let total = 0;
    const clean = messages.map(msg => {
      if (!msg || typeof msg !== 'object' || !['user', 'assistant'].includes(msg.role) ||
          typeof msg.content !== 'string' || !msg.content.trim() || msg.content.length > MAX_MESSAGE_CHARS) {
        throw new ClientError(400, 'Invalid message role, text, or length.');
      }
      total += msg.content.length;
      return { role: msg.role, content: msg.content };
    });
    if (total > MAX_TOTAL_CHARS) throw new ClientError(413, 'Conversation is too long.');
    if (clean.at(-1).role !== 'user') throw new ClientError(400, 'The final message must be a user message.');
    return clean;
  } catch (err) {
    void reader.cancel().catch(() => {});
    if (err instanceof ClientError) throw err;
    throw new ClientError(400, 'Invalid JSON request.');
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

// Global cost budget, shared by all instances. Atomic checks prevent concurrent
// requests from passing the limit. Windows start at the first accepted request.
// No user-controlled key or IP header can create a fresh budget.
export const QUOTA_SCRIPT = `
local retry = 0
for i = 1, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') >= tonumber(ARGV[i * 2 - 1]) then
    retry = math.max(retry, redis.call('TTL', KEYS[i]), 1)
  end
end
if retry > 0 then return retry end
for i = 1, #KEYS do
  local n = redis.call('INCR', KEYS[i])
  if n == 1 then redis.call('EXPIRE', KEYS[i], ARGV[i * 2]) end
end
return 0`;

export async function reserveQuota() {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!endpoint || !token || new URL(endpoint).protocol !== 'https:') throw new Error('Quota unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', QUOTA_SCRIPT, '2', 'peppers:chat:minute', 'peppers:chat:day', '20', '60', '200', '86400']),
    });
    if (!response.ok) throw new Error('Quota unavailable');
    const { result, error } = await response.json();
    if (error || !Number.isInteger(result) || result < 0) throw new Error('Quota unavailable');
    return result;
  } finally { clearTimeout(timeout); }
}
