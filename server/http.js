// Les petits outils HTTP du serveur : réponses JSON, erreurs, corps de
// requête, cookies.

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function sendJson(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

export function sendNoContent(res) {
  res.writeHead(204, { 'Cache-Control': 'no-store' })
  res.end()
}

export function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' })
  res.end()
}

const MAX_BODY = 64 * 1024

/** Le corps JSON de la requête. Refuse ce qui n'est pas du JSON, ou trop gros. */
export async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Le corps de la requête doit être du JSON.')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'Requête trop volumineuse.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'JSON illisible.')
  }
}

export function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const name = part.slice(0, i).trim()
    if (name && !(name in cookies)) cookies[name] = part.slice(i + 1).trim()
  }
  return cookies
}

/** Un en-tête Set-Cookie. Toujours HttpOnly et SameSite=Lax ; Secure en HTTPS. */
export function serializeCookie(name, value, { maxAge, secure }) {
  return [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ')
}

/** Ajoute un Set-Cookie à la réponse, sans écraser ceux déjà posés. */
export function appendCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie') ?? []
  res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : [current]), cookie])
}
