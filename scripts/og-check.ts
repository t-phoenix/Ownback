/**
 * Smoke 0G Private Computer jobs Ownback needs.
 * Usage: npx tsx --env-file=backend/.env scripts/og-check.ts
 */
import { OG_MODELS } from '../backend/src/lib/og/models.ts'

const BASE = 'https://router-api.0g.ai/v1'
const key = process.env.OG_API_KEY
if (!key) {
  console.error('OG_API_KEY missing')
  process.exit(1)
}

const trust = process.env.OG_TRUST_MODE || 'private'

async function chat(
  label: string,
  model: string,
  provider: string,
  messages: unknown[],
  maxTokens = 1024,
) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-0G-Provider-Trust-Mode': trust,
      'X-0G-Provider-Address': provider,
      'X-0G-Provider-Allow-Fallbacks': 'false',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(60_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    id?: string
    x_0g_trace?: { request_id?: string; provider?: string }
    choices?: { message?: { content?: string }; finish_reason?: string }[]
    error?: unknown
  }
  const content = (body.choices?.[0]?.message?.content ?? '').trim()
  const requestId = body.x_0g_trace?.request_id || body.id || null
  console.log(
    `${label}:`,
    res.ok && content ? 'ok' : res.ok ? 'WARN empty content' : `FAIL ${res.status}`,
    `${Date.now() - t0}ms`,
    `model=${model}`,
    `requestId=${requestId}`,
    content ? `content=${JSON.stringify(content).slice(0, 80)}` : `body=${JSON.stringify(body).slice(0, 200)}`,
  )
  return res.ok && Boolean(content || body.x_0g_trace?.request_id)
}

async function embed() {
  const { id, provider } = OG_MODELS.embed
  const t0 = Date.now()
  const res = await fetch(`${BASE}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-0G-Provider-Trust-Mode': trust,
      'X-0G-Provider-Address': provider,
      'X-0G-Provider-Allow-Fallbacks': 'false',
    },
    body: JSON.stringify({ model: id, input: 'Nike' }),
    signal: AbortSignal.timeout(30_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    data?: { embedding?: number[] }[]
    x_0g_trace?: { request_id?: string }
    error?: unknown
  }
  const dim = body.data?.[0]?.embedding?.length ?? 0
  console.log(
    'embed:',
    res.ok && dim > 0 ? 'ok' : `FAIL ${res.status}`,
    `${Date.now() - t0}ms`,
    `model=${id}`,
    `dim=${dim}`,
    `requestId=${body.x_0g_trace?.request_id ?? null}`,
  )
  return res.ok && dim > 0
}

void (async () => {
  console.log(`trust=${trust}`)
  const red64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC'
  const visionOk = await chat(
    'vision(read_receipt)',
    OG_MODELS.vision.id,
    OG_MODELS.vision.provider,
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What color is this image? One word only.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${red64}` } },
        ],
      },
    ],
  )
  const llmOk = await chat(
    'llm(read_invoice)',
    OG_MODELS.llm.id,
    OG_MODELS.llm.provider,
    [{ role: 'user', content: 'Reply with exactly one word and nothing else: pong' }],
  )
  const embedOk = await embed()
  console.log('whisper: skipped (needs audio fixture); model pinned', OG_MODELS.whisper.id)
  process.exit(visionOk && llmOk && embedOk ? 0 : 1)
})()
