// Le client de l'API du serveur (server/app.js). Il remplace supabase-js :
// le compte est celui du cookie de session, que le navigateur envoie seul.

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Session expirée en cours de route : retour à la connexion.
    if (res.status === 401 && path !== '/api/me') window.location.assign('/login')
    throw new ApiError(res.status, data?.error ?? `Erreur ${res.status}`)
  }
  return data
}

let currentUser = null

/** Le compte connecté ({ id, email, created_at }), ou null. Demandé une fois, puis gardé. */
export function getCurrentUser() {
  currentUser ??= request('GET', '/api/me').catch(error => {
    currentUser = null
    if (error.status === 401) return null
    throw error
  })
  return currentUser
}

export function forgetCurrentUser() {
  currentUser = null
}

export const api = {
  getSettings: () => request('GET', '/api/settings'),
  saveSettings: settings => request('PUT', '/api/settings', settings),

  listYearlyRtt: () => request('GET', '/api/yearly-rtt'),
  addYearlyRtt: ({ year, rtt_count }) => request('POST', '/api/yearly-rtt', { year, rtt_count }),
  updateYearlyRtt: (id, { rtt_count }) => request('PATCH', `/api/yearly-rtt/${id}`, { rtt_count }),
  deleteYearlyRtt: id => request('DELETE', `/api/yearly-rtt/${id}`),

  listEntries: () => request('GET', '/api/entries'),
  addEntries: entries => request('POST', '/api/entries', { entries }),
  deleteEntries: ids => request('DELETE', '/api/entries', { ids }),

  async logout() {
    await request('POST', '/auth/logout')
    forgetCurrentUser()
  },
  async deleteAccount() {
    await request('DELETE', '/api/account')
    forgetCurrentUser()
  },
}
