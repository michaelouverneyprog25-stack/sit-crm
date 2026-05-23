export const CACHE_KEYS = {
  users: 'sit.users.cache',
  stores: 'sit.stores.cache',
}

export function readArrayCache(key) {
  if (typeof window === 'undefined' || !window.localStorage) return []

  try {
    const value = window.localStorage.getItem(key)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn(`Nao foi possivel ler cache ${key}`, error)
    return []
  }
}

export function writeArrayCache(key, items) {
  if (typeof window === 'undefined' || !window.localStorage) return

  try {
    window.localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : []))
  } catch (error) {
    console.warn(`Nao foi possivel salvar cache ${key}`, error)
  }
}

export function sortByName(items) {
  return [...items].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
}
