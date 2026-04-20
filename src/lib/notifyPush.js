import { supabase } from './supabase'

export async function notifyPush({ userIds, title, body, url, tag, icon } = {}) {
  if (!Array.isArray(userIds) || !userIds.length || !title) return
  try {
    await supabase.functions.invoke('send-push', {
      body: { user_ids: [...new Set(userIds.filter(Boolean))], title, body, url, tag, icon },
    })
  } catch (e) {
    console.warn('send-push failed', e?.message || e)
  }
}
