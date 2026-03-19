// ── DEPRECATED — This file is no longer used ──────────────────────────────────
// The portfolio was migrated from Supabase to GitHub as the storage backend.
// All data operations now go through github.js (loadAll, saveSection, etc.)
// This file is kept for reference only. Do NOT import it — @supabase/supabase-js
// is not in package.json and will cause a build failure if imported.
// ─────────────────────────────────────────────────────────────────────────────

// import { createClient } from '@supabase/supabase-js'  ← removed (not in package.json)
// Stub so the rest of the file doesn't throw ReferenceError at parse time
const createClient = () => { throw new Error('supabase.js is deprecated — use github.js instead') }

const CONFIG_KEY = 'portfolio_supabase_config'

export function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveSupabaseConfig(url, anonKey) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }))
}

export function clearSupabaseConfig() {
  localStorage.removeItem(CONFIG_KEY)
}

let _client = null

export function getClient() {
  if (_client) return _client
  const cfg = getSupabaseConfig()
  if (!cfg?.url || !cfg?.anonKey) return null
  _client = createClient(cfg.url, cfg.anonKey)
  return _client
}

// FIX: resetClient now removes lingering channel subscriptions
// to prevent memory leaks when the user reconnects with new credentials.
export function resetClient() {
  if (_client) {
    try { _client.removeAllChannels() } catch (_) { /* ignore */ }
  }
  _client = null
}

// ── Portfolio data helpers ──────────────────────────────────────────────────
// All data lives in one row per "section" in the portfolio_data table:
//   id (text PK) | data (jsonb) | updated_at (timestamptz)

export async function loadSection(section, fallback) {
  const sb = getClient()
  if (!sb) return fallback
  try {
    const { data, error } = await sb
      .from('portfolio_data')
      .select('data')
      .eq('id', section)
      .single()
    if (error || !data) return fallback
    return data.data
  } catch { return fallback }
}

export async function saveSection(section, value) {
  const sb = getClient()
  if (!sb) throw new Error('Supabase not configured')
  const { error } = await sb
    .from('portfolio_data')
    .upsert(
      { id: section, data: value, updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: false }
    )
  if (error) {
    // Common causes: RLS blocking writes, table doesn't exist, wrong key
    console.error('[Supabase] saveSection error:', error)
    throw new Error(`Save failed for "${section}": ${error.message} (code: ${error.code})`)
  }
}

export async function loadAll(defaults) {
  const sb = getClient()
  if (!sb) return defaults
  try {
    const { data, error } = await sb.from('portfolio_data').select('id, data')
    if (error || !data) return defaults
    const result = { ...defaults }
    // FIX 1: Skip the connection-test heartbeat row — it should never
    //         appear in the live portfolio or admin data.
    // FIX 2: Guard against null data values that would overwrite default
    //         arrays/objects and cause downstream .length crashes.
    data.forEach(row => { if (row.id && row.id !== '__connection_test__' && row.data != null) result[row.id] = row.data })
    return result
  } catch { return defaults }
}

// Subscribe to any change in portfolio_data and call callback
export function subscribeToChanges(callback) {
  const sb = getClient()
  if (!sb) return () => {}
  const channel = sb
    .channel('portfolio_data_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_data' }, callback)
    .subscribe()
  return () => sb.removeChannel(channel)
}

// Test connection by pinging the table with a read then a write.
// FIX: validates inputs, and deletes the heartbeat row after writing
//      so it never pollutes the live portfolio_data table.
export async function testConnection(url, anonKey) {
  if (!url || !anonKey) {
    return { ok: false, msg: 'URL and anon key are required.' }
  }
  try {
    const client = createClient(url, anonKey)
    // Test read
    const { data, error } = await client.from('portfolio_data').select('id').limit(1)
    if (error) return { ok: false, msg: `Read failed: ${error.message} (${error.code})` }
    // Test write (upsert a heartbeat row)
    const { error: writeErr } = await client
      .from('portfolio_data')
      .upsert({ id: '__connection_test__', data: { ts: Date.now() }, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (writeErr) return { ok: false, msg: `Write failed — check RLS policies allow INSERT/UPDATE for anon role: ${writeErr.message}` }
    // FIX: clean up the test row so it never shows in the live portfolio
    await client.from('portfolio_data').delete().eq('id', '__connection_test__')
    return { ok: true }
  } catch (e) {
    return { ok: false, msg: e.message }
  }
}
