# Chat security and deployment

## Required before enabling chat

Configure these **server-side** Vercel environment variables for the intended
Preview/Production environment, then redeploy:

- `GEMINI_API_KEY`: the existing Google API key.
- `UPSTASH_REDIS_REST_URL`: HTTPS REST endpoint of a persistent Upstash Redis database.
- `UPSTASH_REDIS_REST_TOKEN`: the database's write-capable REST token.

Never add these values to public JavaScript or commits. `.env*` and `.vercel/`
are ignored; `.env.example` contains names only. If a credential was previously
published, deleting the file does not revoke the credential: rotate it.

Chat returns a generic 503 without calling Gemini if the key or quota service
is missing or unavailable. The rest of the site still works. No Redis resource
or deployment configuration is provisioned by this change.

## Enforced boundaries

- Maximum body: 32 KiB, measured while reading, even without Content-Length.
- Body read deadline: 5 seconds. JSON only; compressed requests rejected.
- 1–10 messages; `user`/`assistant` roles only; non-empty strings up to 2,000
  UTF-16 code units each and 8,000 in total. Final message must be from a user.
- Shared global budget: 20 accepted requests per 60 seconds and 200 per 24 hours.
  Redis Lua checks/increments both counters atomically; windows begin with the
  first accepted request. TTL expiration resets the corresponding budget.
  Provider failures still consume a reservation. A request may attempt at most
  two configured models, each with a 500-output-token limit.
- Quota service deadline: 3 seconds. Each model attempt: 8 seconds, including
  response streaming. Client cancellation also cancels the provider request.
- Provider stream: maximum 256 KiB and 16,000 output characters. Raw provider
  bodies and generated chat text are not logged or returned as diagnostics.
- Same-origin browser requests only. This is not authentication: scripts can
  forge Origin, so cost protection comes from the shared Redis budget.
- Plain text rendering of chat output; repeated submission is blocked while a
  response is pending. Client history is bounded and fetch has a deadline.
- CSP restricts executable scripts to local assets and the two exact CDN script
  paths; SHA-384 integrity attributes verify those CDN files. Framing, plugins,
  and base-tag injection are blocked. Inline styles remain allowed because the
  existing design uses style attributes and JavaScript-applied styles.

The global budget is intentionally shared across visitors and deployments using
this database. An abusive visitor can exhaust it and temporarily deny chat to
others. It is a spending guardrail, not a DDoS defense or a per-visitor quota.
A Vercel Firewall rule or bot challenge can reduce traffic before it reaches
Redis/functions; infrastructure costs are not capped by the application quota.
Keep the quota database persistent and avoid deleting/evicting its counter keys,
as resetting storage resets the budget. Preview traffic shares the cap when
using the same database. Model output is untrusted; public team context is not
confidential and prompts are not an authorization boundary.

## Verification

Run with Node 22 or newer:

```sh
node --test tests/security.test.mjs
```

Tests use mocked Redis REST and Gemini responses. They cover malformed and large
requests, rejected origins, quotas failing closed, response sanitization,
stream parsing/limits/deadlines, cancellation, and duplicate widget submissions.
They do not certify a live Redis deployment, model availability, or Vercel
routing. Before merging, verify a configured preview can complete one chat,
returns the configured security headers, and still loads both robot viewers and
external fonts/images without CSP errors. Confirm a blocked-origin request gets
403 and an exhausted quota gets 429 with Retry-After.

Reference documentation:
- https://upstash.com/docs/redis/features/restapi
- https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval
- https://vercel.com/docs/project-configuration/vercel-json
