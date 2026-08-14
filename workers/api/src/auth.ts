import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'
import type { MiddlewareHandler } from 'hono'
import type { AccessIdentity, Env, Variables } from './bindings'

interface AccessClaims extends JWTPayload {
  email?: string
  common_name?: string
}
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function teamOrigin(value: string) {
  const host = value.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `https://${host}`
}

function accessToken(request: Request) {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion')
  if (assertion) return assertion
  const match = request.headers.get('cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)
  return match?.[1]
}

function localIdentity(c: Parameters<MiddlewareHandler<{ Bindings: Env; Variables: Variables }>>[0]) {
  const hostname = new URL(c.req.url).hostname
  if (c.env.LOCAL_DEV_MODE !== 'true' || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return null
  return { actorId: c.env.OWNER_EMAIL_SECRET.toLowerCase(), actorType: 'owner' as const, email: c.env.OWNER_EMAIL_SECRET.toLowerCase() }
}

export const authenticateAccess: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const local = localIdentity(c)
  if (local) {
    c.set('identity', local)
    return next()
  }

  if (c.env.ACCESS_ENFORCED !== 'true' || !c.env.CF_ACCESS_TEAM_DOMAIN || !c.env.CF_ACCESS_AUD) {
    return c.json({ error: { code: 'access_not_configured', message: 'Cloudflare Access is not configured; the application is closed', request_id: c.get('requestId') } }, 503)
  }
  const token = accessToken(c.req.raw)
  if (!token) return c.json({ error: { code: 'unauthorized', message: 'Cloudflare Access session required', request_id: c.get('requestId') } }, 401)

  let identity: AccessIdentity
  try {
    const origin = teamOrigin(c.env.CF_ACCESS_TEAM_DOMAIN)
    let jwks = jwksCache.get(origin)
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${origin}/cdn-cgi/access/certs`), { cooldownDuration: 300_000 })
      jwksCache.set(origin, jwks)
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: origin,
      audience: c.env.CF_ACCESS_AUD,
      algorithms: ['RS256'],
      clockTolerance: 5,
    })
    const claims = payload as AccessClaims
    if (claims.common_name) {
      identity = { actorId: `service:${claims.common_name}`, actorType: 'gpt', serviceTokenId: claims.common_name }
    } else if (claims.email) {
      const email = claims.email.toLowerCase()
      identity = { actorId: email, actorType: 'owner', email }
    } else {
      throw new Error('identity_claim_missing')
    }
  } catch {
    return c.json({ error: { code: 'invalid_access_token', message: 'Cloudflare Access token is invalid or expired', request_id: c.get('requestId') } }, 401)
  }
  c.set('identity', identity)
  await next()
}

export const requireOwner: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const identity = c.get('identity')
  if (identity.actorType !== 'owner' || identity.email !== c.env.OWNER_EMAIL_SECRET.toLowerCase()) {
    return c.json({ error: { code: 'owner_required', message: 'This operation is available only in the private PWA', request_id: c.get('requestId') } }, 403)
  }
  await next()
}

export const requireGpt: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const identity = c.get('identity')
  if (identity.actorType !== 'gpt' || !c.env.GPT_SERVICE_TOKEN_ID_SECRET || identity.serviceTokenId !== c.env.GPT_SERVICE_TOKEN_ID_SECRET) {
    return c.json({ error: { code: 'gpt_client_required', message: 'Authorized Personal OS GPT service token required', request_id: c.get('requestId') } }, 403)
  }
  await next()
}

export const requireSameOrigin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return next()
  const origin = c.req.header('origin')
  const expected = new URL(c.env.APP_ORIGIN).origin
  if (!origin || origin !== expected) {
    return c.json({ error: { code: 'csrf_rejected', message: 'Same-origin request required', request_id: c.get('requestId') } }, 403)
  }
  await next()
}
