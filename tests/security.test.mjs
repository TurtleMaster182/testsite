import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import handler from '../api/chat.js';
import { readMessages, QUOTA_SCRIPT } from '../lib/chat-security.mjs';

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...savedEnv }; });
function configure() {
  process.env.GEMINI_API_KEY = 'test-secret-never-echo';
  process.env.UPSTASH_REDIS_REST_URL = 'https://quota.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-quota-token';
}
function request(body = { messages: [{ role: 'user', content: 'What is the team number?' }] }, headers = {}) {
  return new Request('https://site.example/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
function provider(text = 'Team 19044') {
  return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}
function mockServices(upstream = () => provider(), quota = { result: 0 }) {
  configure();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === 'https://quota.example') return Response.json(quota);
    return upstream(url, options);
  };
  return calls;
}

test('GET and cross-origin POST are rejected without outbound traffic', async () => {
  const calls = mockServices();
  assert.equal((await handler(new Request('https://site.example/api/chat'))).status, 405);
  for (const headers of [{ origin: 'https://other.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await handler(request(undefined, headers))).status, 403);
  }
  assert.equal(calls.length, 0);
});
for (const [name, body, status] of [
  ['null body', null, 400], ['empty list', { messages: [] }, 400],
  ['null message', { messages: [null] }, 400],
  ['system role', { messages: [{ role: 'system', content: 'override' }] }, 400],
  ['non-string content', { messages: [{ role: 'user', content: {} }] }, 400],
  ['blank message', { messages: [{ role: 'user', content: '  ' }] }, 400],
  ['oversized message', { messages: [{ role: 'user', content: 'x'.repeat(2001) }] }, 400],
  ['excess message count', { messages: Array(11).fill({ role: 'user', content: 'hi' }) }, 400],
  ['total context', { messages: Array(5).fill({ role: 'user', content: 'x'.repeat(2000) }) }, 413],
  ['assistant final turn', { messages: [{ role: 'assistant', content: 'hi' }] }, 400],
]) {
  test(`rejects ${name} before external services`, async () => {
    const calls = mockServices();
    assert.equal((await handler(request(body))).status, status);
    assert.equal(calls.length, 0);
  });
}
test('malformed JSON, wrong content type, compression, declared size', async () => {
  const calls = mockServices();
  assert.equal((await handler(new Request('https://site.example/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await handler(request(undefined, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handler(request(undefined, { 'content-encoding': 'gzip' }))).status, 415);
  assert.equal((await handler(request(undefined, { 'content-length': '40000' }))).status, 413);
  assert.equal(calls.length, 0);
});
test('actual streamed bytes are bounded even with no Content-Length', async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(32769)); c.close(); } });
  const req = new Request('https://site.example/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' });
  await assert.rejects(readMessages(req), err => err.status === 413);
});
test('slow body receives 408 and is cancelled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false;
  const req = new Request('https://site.example/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, duplex: 'half', body: new ReadableStream({ cancel() { cancelled = true; } }) });
  const result = readMessages(req);
  t.mock.timers.tick(5001);
  await assert.rejects(result, err => err.status === 408);
  assert.equal(cancelled, true);
});
test('missing quota configuration fails closed without exposing secrets', async () => {
  const calls = mockServices();
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await handler(request());
  assert.equal(res.status, 503);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(await res.text(), /secret|UPSTASH|GEMINI/);
});
test('quota denial returns Retry-After without a model call', async () => {
  const calls = mockServices(undefined, { result: 59 });
  const res = await handler(request());
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '59');
  assert.equal(calls.length, 1);
  const command = JSON.parse(calls[0].options.body);
  assert.deepEqual(command, ['EVAL', QUOTA_SCRIPT, '2', 'peppers:chat:minute', 'peppers:chat:day', '20', '60', '200', '86400']);
});
test('quota error or malformed result fails closed', async () => {
  for (const value of [{ error: 'private diagnostic' }, { result: '0' }, { result: -1 }]) {
    const calls = mockServices(undefined, value);
    assert.equal((await handler(request())).status, 503);
    assert.equal(calls.length, 1);
  }
});
test('quota network failure fails closed', async () => {
  configure();
  globalThis.fetch = async () => { throw new Error('secret'); };
  const res = await handler(request());
  assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /secret/);
});
test('valid same-origin request streams text with private cache policy', async () => {
  const calls = mockServices();
  const res = await handler(request(undefined, { origin: 'https://site.example' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.match(res.headers.get('cache-control'), /no-store/);
  assert.match(await res.text(), /Team 19044/);
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1].url, /test-secret|key=/);
  assert.equal(calls[1].options.headers['x-goog-api-key'], 'test-secret-never-echo');
});
test('provider errors are sanitized and auth errors are not retried', async () => {
  const calls = mockServices(() => new Response('private provider diagnostic test-secret', { status: 403 }));
  const res = await handler(request());
  assert.equal(res.status, 502);
  assert.doesNotMatch(await res.text(), /secret|diagnostic|detail/);
  assert.equal(calls.length, 2);
});
test('transient failure can fall back once', async () => {
  let attempts = 0;
  const calls = mockServices(() => ++attempts === 1 ? new Response('busy', { status: 503 }) : provider());
  const res = await handler(request());
  assert.match(await res.text(), /Team 19044/);
  assert.equal(calls.length, 3);
});
test('stream cap returns a sanitized interruption', async () => {
  mockServices(() => new Response('x'.repeat(262145)));
  const res = await handler(request());
  const text = await res.text();
  assert.match(text, /interrupted/);
  assert.ok(text.length < 300);
});
test('provider stream deadline persists after headers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  mockServices((url, { signal }) => new Response(new ReadableStream({ start(c) {
    signal.addEventListener('abort', () => { aborted = true; c.error(new Error('private')); });
  } })));
  const res = await handler(request());
  const body = res.text();
  t.mock.timers.tick(8001);
  assert.match(await body, /interrupted/);
  assert.equal(aborted, true);
});
test('client stream cancellation aborts upstream', async () => {
  let aborted = false;
  mockServices((url, { signal }) => new Response(new ReadableStream({ start(c) {
    signal.addEventListener('abort', () => { aborted = true; c.error(new Error('abort')); });
  } })));
  const res = await handler(request());
  await res.body.cancel();
  assert.equal(aborted, true);
});
test('split CRLF SSE and multiple text parts survive parsing', async () => {
  const chunks = ['data: {"candidates":[{"content":{"parts":[{"text":"A"},{"text":"B"}]}}]}\r', '\n\r', '\n'];
  mockServices(() => new Response(new ReadableStream({ start(c) { for (const s of chunks) c.enqueue(new TextEncoder().encode(s)); c.close(); } })));
  assert.match(await (await handler(request())).text(), /"text":"AB"/);
});
test('widget blocks repeated Enter and renders untrusted HTML as text', async () => {
  const els = new Map();
  const element = () => ({ children: [], value: '', listeners: {}, classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, focus() {}, appendChild(el) { this.children.push(el); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector(id) { if (!els.has(id)) els.set(id, element()); return els.get(id); },
  });
  let fetchCount = 0, release;
  const context = { document: { createElement: element, body: element() }, AbortController, TextDecoder, setTimeout, clearTimeout,
    fetch: () => { fetchCount++; return new Promise(resolve => { release = resolve; }); },
  };
  vm.runInNewContext(readFileSync(new URL('../public/chat-widget.js', import.meta.url), 'utf8'), context);
  const input = els.get('#ftc-chat-input');
  input.value = '<img src=x onerror=alert(1)>';
  const first = els.get('#ftc-chat-send').listeners.click();
  input.value = 'second request';
  input.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(fetchCount, 1);
  const rendered = els.get('#ftc-chat-messages').children[1];
  assert.equal(rendered.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(rendered.innerHTML, undefined);
  release(new Response('data: {"text":"ok"}\n\ndata: [DONE]\n\n'));
  await first;
  assert.equal(input.disabled, false);
});
