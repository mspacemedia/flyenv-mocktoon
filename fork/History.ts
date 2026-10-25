import { open } from 'node:fs/promises'
import type { HistoryRow } from '../shared/types'

const sensitive =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$/i
function redact(value: any): any {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value))
    return value.map((entry) =>
      entry && typeof entry.key === 'string' && sensitive.test(entry.key)
        ? { ...entry, value: '[REDACTED]' }
        : redact(entry)
    )
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitive.test(key) ? '[REDACTED]' : redact(entry)
    ])
  )
}

export function parseHistory(text: string): HistoryRow[] {
  const rows: HistoryRow[] = []
  for (const line of text.split(/\r?\n/)) {
    try {
      const data = JSON.parse(line)
      if (!data.transaction || data.requestPath?.startsWith('/__mocktoon/')) continue
      rows.push({
        time: String(data.timestamp ?? ''),
        environment: String(data.environmentName ?? ''),
        method: String(data.requestMethod ?? ''),
        path: String(data.requestPath ?? ''),
        status: Number(data.responseStatus),
        request: redact(data.transaction.request),
        response: redact(data.transaction.response)
      })
    } catch {
      /* A partial/diagnostic line is independent of valid transactions. */
    }
  }
  return rows.slice(-100).reverse()
}

export async function readLogTail(
  file: string,
  limit = 512_000
): Promise<{ text: string; truncated: boolean }> {
  let handle
  try {
    handle = await open(file, 'r')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: '', truncated: false }
    throw error
  }
  try {
    const { size } = await handle.stat(),
      length = Math.min(size, limit)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const text = buffer.toString('utf8')
    return { text, truncated: size > length }
  } finally {
    await handle.close()
  }
}

export async function readHistory(file: string): Promise<HistoryRow[]> {
  const { text, truncated } = await readLogTail(file)
  return parseHistory(truncated ? text.slice(text.indexOf('\n') + 1) : text)
}
