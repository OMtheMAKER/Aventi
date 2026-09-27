const TOKEN_KEY = 'hp_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function req(path, opts = {}) {
  const token = getToken()
  // Mirror the session token into the query string as well: some preview
  // proxies strip Authorization headers and block cookies in iframes, so the
  // URL is the one transport nothing can filter away.
  let url = `/api${path}`
  if (token) url += (url.includes('?') ? '&' : '?') + `hp_token=${encodeURIComponent(token)}`

  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { credentials: 'same-origin', ...opts, headers })
  let data = {}
  try {
    data = await res.json()
  } catch (e) {
    data = {}
  }
  if (!res.ok) {
    throw new Error(data.detail || 'Request failed')
  }
  return data
}

async function reqUpload(path, formData) {
  const token = getToken()
  let url = `/api${path}`
  if (token) url += `?hp_token=${encodeURIComponent(token)}`
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: formData,
  })
  let data = {}
  try {
    data = await res.json()
  } catch (e) {
    data = {}
  }
  if (!res.ok) {
    throw new Error(data.detail || 'Upload failed')
  }
  return data
}

export const api = {
  get: (p) => req(p),
  post: (p, body) => req(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (p, body) => req(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
  patch: (p, body) => req(p, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  del: (p) => req(p, { method: 'DELETE' }),
  upload: (p, formData) => reqUpload(p, formData),
}
