// La PWA construite par Vite (dist/). Les règles de cache :
// - index.html, le service worker et le manifeste : no-cache, pour qu'une
//   nouvelle version soit vue au prochain chargement ;
// - /assets/ : un an, immutable (leur nom change avec leur contenu) ;
// - le reste : no-cache aussi, revalidé par ETag.
// Une route de l'app (/settings…) renvoie index.html ; un fichier absent, 404.

import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { HttpError } from './http.js'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const IMMUTABLE = 'public, max-age=31536000, immutable'
const NO_CACHE = 'no-cache'

export function createStatic(dir) {
  const root = resolve(dir)

  function fileAt(pathname) {
    const path = resolve(join(root, normalize(pathname)))
    if (path !== root && !path.startsWith(root + sep)) return null
    try {
      const stat = statSync(path)
      return stat.isFile() ? { path, stat } : null
    } catch {
      return null
    }
  }

  function send(req, res, file, cacheControl) {
    const etag = `W/"${file.stat.size.toString(16)}-${Math.floor(file.stat.mtimeMs).toString(16)}"`
    const headers = {
      'Content-Type': TYPES[extname(file.path).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': cacheControl,
      ETag: etag,
    }
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers)
      return res.end()
    }
    res.writeHead(200, { ...headers, 'Content-Length': file.stat.size })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file.path).pipe(res)
  }

  return function serveStatic(req, res, rawPathname) {
    let pathname
    try {
      pathname = decodeURIComponent(rawPathname)
    } catch {
      throw new HttpError(400, 'Adresse illisible.')
    }
    if (pathname.includes('\0')) throw new HttpError(400, 'Adresse illisible.')

    const file = pathname === '/' ? null : fileAt(pathname)
    if (file) return send(req, res, file, pathname.startsWith('/assets/') ? IMMUTABLE : NO_CACHE)

    // Une route de l'app n'a pas d'extension : c'est index.html qui la sert.
    if (!extname(pathname)) {
      const index = fileAt('/index.html')
      if (index) return send(req, res, index, NO_CACHE)
    }
    throw new HttpError(404, 'Introuvable.')
  }
}
