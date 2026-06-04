import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/middleware.js'

const SL_BASE = 'https://app.simplelogin.io/api'

export function registerSimpleLoginRoutes(app: FastifyInstance): void {
  // Create an alias on the custom domain (vidar.fr) when available,
  // falling back to a random alias on the default SL domain.
  // apiKey is forwarded in transit but never logged or stored.
  app.post('/simplelogin/alias', { preHandler: requireAuth }, async (req, reply) => {
    const { apiKey, note } = req.body as { apiKey?: string; note?: string }
    if (!apiKey) return reply.code(400).send({ error: 'apiKey required' })

    // Try to create alias on custom domain (vidar.fr) first
    const optionsRes = await fetch(`${SL_BASE}/v5/alias/options?hostname=vidar.fr`, {
      headers: { Authentication: apiKey },
    }).catch(() => null)

    if (optionsRes?.ok) {
      const options = await optionsRes.json() as {
        can_create: boolean
        suffixes: Array<{ suffix: string; signed_suffix: string; is_custom: boolean }>
      }
      const customSuffix = options.suffixes?.find(s => s.is_custom)
      if (options.can_create && customSuffix) {
        const prefix = `nyx-${Math.random().toString(36).slice(2, 10)}`
        const customRes = await fetch(`${SL_BASE}/v2/alias/custom/new`, {
          method: 'POST',
          headers: { Authentication: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alias_prefix:  prefix,
            signed_suffix: customSuffix.signed_suffix,
            note:          note ?? 'nyx opt-out',
          }),
        }).catch(() => null)

        if (customRes?.ok) {
          const data = await customRes.json() as { alias?: string; id?: number }
          if (data.alias) return reply.send({ alias: data.alias, aliasId: data.id ?? null })
        }
      }
    }

    // Fallback: random alias on default SL domain
    const res = await fetch(`${SL_BASE}/alias/random/new`, {
      method: 'POST',
      headers: { Authentication: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note ?? 'nyx opt-out' }),
    }).catch(() => null)

    if (!res) return reply.code(502).send({ error: 'Could not reach SimpleLogin' })
    if (!res.ok) return reply.code(res.status).send({ error: `SimpleLogin returned ${res.status}` })

    const data = await res.json() as { alias?: string; id?: number }
    if (!data.alias) return reply.code(502).send({ error: 'No alias in SimpleLogin response' })
    return reply.send({ alias: data.alias, aliasId: data.id ?? null })
  })

  // Delete an alias by its numeric ID.
  app.delete('/simplelogin/alias/:aliasId', { preHandler: requireAuth }, async (req, reply) => {
    const { aliasId } = req.params as { aliasId: string }
    const { apiKey } = req.body as { apiKey?: string }
    if (!apiKey) return reply.code(400).send({ error: 'apiKey required' })

    const res = await fetch(`${SL_BASE}/aliases/${aliasId}`, {
      method: 'DELETE',
      headers: { Authentication: apiKey },
    }).catch(() => null)

    if (!res) return reply.code(502).send({ error: 'Could not reach SimpleLogin' })
    if (!res.ok) return reply.code(res.status).send({ error: `SimpleLogin returned ${res.status}` })
    return reply.code(204).send()
  })

  // List all nyx-created aliases (paginated fetch, filter by note prefix).
  app.post('/simplelogin/aliases/nyx', { preHandler: requireAuth }, async (req, reply) => {
    const { apiKey } = req.body as { apiKey?: string }
    if (!apiKey) return reply.code(400).send({ error: 'apiKey required' })

    const nyxAliases: { id: number; alias: string }[] = []
    let page = 0
    while (page < 50) {
      const res = await fetch(`${SL_BASE}/aliases?page_id=${page}`, {
        headers: { Authentication: apiKey },
      }).catch(() => null)

      if (!res || !res.ok) break
      const data = await res.json() as { aliases?: { id: number; email: string; note?: string | null }[] }
      const aliases = data.aliases ?? []
      if (aliases.length === 0) break

      for (const a of aliases) {
        if (a.note?.startsWith('nyx')) {
          nyxAliases.push({ id: a.id, alias: a.email })
        }
      }
      page++
    }

    return reply.send({ aliases: nyxAliases })
  })

  // Bulk-delete a list of alias IDs.
  app.post('/simplelogin/aliases/purge', { preHandler: requireAuth }, async (req, reply) => {
    const { apiKey, aliasIds } = req.body as { apiKey?: string; aliasIds?: number[] }
    if (!apiKey) return reply.code(400).send({ error: 'apiKey required' })
    if (!Array.isArray(aliasIds) || aliasIds.length === 0) return reply.send({ deleted: 0 })

    let deleted = 0
    await Promise.allSettled(
      aliasIds.map(async id => {
        const res = await fetch(`${SL_BASE}/aliases/${id}`, {
          method: 'DELETE',
          headers: { Authentication: apiKey },
        }).catch(() => null)
        if (res?.ok) deleted++
      })
    )

    return reply.send({ deleted })
  })
}
