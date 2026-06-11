import { supabase } from './supabase'

export async function notifyPush({ userIds, title, body, url, tag, icon } = {}) {
  if (!Array.isArray(userIds) || !userIds.length || !title) return null
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { user_ids: [...new Set(userIds.filter(Boolean))], title, body, url, tag, icon },
    })
    if (error) { console.warn('send-push failed', error.message || error); return { error: error.message || String(error) } }
    // data: { sent, failed, pruned, reason? } — מאפשר למי שקורא להציג דיאגנוסטיקה
    return data
  } catch (e) {
    console.warn('send-push failed', e?.message || e)
    return { error: e?.message || 'unknown' }
  }
}
