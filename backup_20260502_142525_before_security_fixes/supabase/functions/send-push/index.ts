// Supabase Edge Function — sends Web Push notifications to users.
// Setup once:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:teampactbjj@gmail.com
//   supabase functions deploy send-push
// Invoke from client:
//   await supabase.functions.invoke('send-push', { body: { user_ids, title, body, url, tag } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_USERS = 5000
const MAX_BODY = 500
const MAX_TITLE = 120

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log(`[send-push] incoming ${req.method} ${req.url}`)

  try {
    const payload = await req.json().catch(() => null)
    console.log('[send-push] payload', JSON.stringify(payload))
    if (!payload) return bad('invalid json')

    const userIds: string[] = Array.isArray(payload.user_ids) ? payload.user_ids.slice(0, MAX_USERS) : []
    const title: string = String(payload.title || '').slice(0, MAX_TITLE)
    const body: string  = String(payload.body  || '').slice(0, MAX_BODY)
    const url: string   = String(payload.url   || '/')
    const tag: string   = payload.tag ? String(payload.tag).slice(0, 80) : ''
    const icon: string  = String(payload.icon  || '/icons/icon-192.png')

    if (!userIds.length || !title) {
      console.log('[send-push] rejected: missing user_ids or title', { userIds: userIds.length, title })
      return bad('missing user_ids or title')
    }

    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    const subj = Deno.env.get('VAPID_SUBJECT') || 'mailto:teampactbjj@gmail.com'
    if (!pub || !priv) return bad('VAPID keys missing', 500)

    webpush.setVapidDetails(subj, pub, priv)

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: subs, error } = await supa
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', userIds)
    if (error) return bad(`db error: ${error.message}`, 500)

    if (!subs || !subs.length) {
      return json({ sent: 0, failed: 0, pruned: 0, reason: 'no_subscriptions' })
    }

    const notificationPayload = JSON.stringify({ title, body, url, tag, icon })
    const staleEndpoints: string[] = []

    // Apple Web Push rejects topics that aren't short base64url (max 32 chars),
    // so only pass topic to non-Apple endpoints and sanitize it.
    const safeTopic = (tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined

    const results = await Promise.allSettled(
      subs.map((s: any) => {
        const isApple = /web\.push\.apple\.com/.test(s.endpoint)
        const opts: any = { TTL: 60, urgency: 'high' }
        if (!isApple && safeTopic) opts.topic = safeTopic
        return webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notificationPayload,
          opts,
        ).catch((err: any) => {
          const code = err?.statusCode || err?.status
          const body = err?.body || ''
          // 404/410: endpoint gone. 403 with VAPID mismatch: sub was created
          // with a different VAPID key and cannot be recovered — treat as stale.
          const vapidMismatch = code === 403 && /VAPID credentials/i.test(String(body))
          if (code === 404 || code === 410 || vapidMismatch) staleEndpoints.push(s.endpoint)
          throw err
        })
      }),
    )

    let sent = 0, failed = 0
    const failures: Array<{ endpoint: string; code: any; body: any }> = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') sent++
      else {
        failed++
        const err: any = r.reason
        failures.push({
          endpoint: subs[i].endpoint.slice(0, 60) + '...',
          code: err?.statusCode || err?.status || 'unknown',
          body: err?.body || String(err?.message || err).slice(0, 200),
        })
      }
    }

    let pruned = 0
    if (staleEndpoints.length) {
      const { error: delErr, count } = await supa
        .from('push_subscriptions')
        .delete({ count: 'exact' })
        .in('endpoint', staleEndpoints)
      if (!delErr) pruned = count || 0
    }

    console.log(JSON.stringify({ sent, failed, pruned, userIds: userIds.length, title, failures }))
    return json({ sent, failed, pruned, failures })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsJson() })
  }
})

function corsJson() {
  return { ...corsHeaders, 'Content-Type': 'application/json' }
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: corsJson() })
}
function bad(msg: string, status = 400) {
  return json({ error: msg }, status)
}
