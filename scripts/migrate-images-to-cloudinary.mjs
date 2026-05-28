/**
 * migrate-images-to-cloudinary.mjs
 * מגרר תמונות קיימות מ-Supabase Storage ל-Cloudinary
 * מעדכן את ה-DB עם ה-URL החדש
 *
 * הרצה:
 *   cd /Users/dudibenzaken/teampact-app
 *   node scripts/migrate-images-to-cloudinary.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { Readable } from 'stream'

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL   = 'https://pnicoluujpidguvniwub.supabase.co'
const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWNvbHV1anBpZGd1dm5pd3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTY2NjUsImV4cCI6MjA5MTI5MjY2NX0.I7bRbvy1eU-W3MrlHuB93v2nGffsA9oiapfaa3SX6nM'

const CLOUDINARY_CLOUD  = 'ds09n9hlm'
const CLOUDINARY_PRESET = 'teampact_unsigned'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function isSupabaseUrl(url) {
  return typeof url === 'string' && url.includes('pnicoluujpidguvniwub.supabase.co')
}

async function uploadToCloudinary(imageUrl) {
  // שולחים את ה-URL ישירות ל-Cloudinary — הוא מוריד בעצמו
  const form = new FormData()
  form.append('file', imageUrl)
  form.append('upload_preset', CLOUDINARY_PRESET)
  form.append('folder', 'teampact')

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: 'POST', body: form }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Cloudinary HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.secure_url
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('🔍 מושך רשומות מ-announcements...')
  const { data: rows, error } = await supabase
    .from('announcements')
    .select('id, image_url, title')
    .not('image_url', 'is', null)

  if (error) { console.error('❌ שגיאה במשיכת נתונים:', error.message); process.exit(1) }
  if (!rows?.length) { console.log('ℹ️  אין רשומות עם image_url'); return }

  const toMigrate = rows.filter(r => isSupabaseUrl(r.image_url))
  console.log(`📋 סה"כ ${rows.length} רשומות עם תמונה, ${toMigrate.length} מ-Supabase Storage\n`)

  if (!toMigrate.length) {
    console.log('✅ כל התמונות כבר ב-Cloudinary!')
    return
  }

  let ok = 0, fail = 0

  for (const row of toMigrate) {
    process.stdout.write(`⬆️  [${row.id}] "${row.title?.slice(0,40)}"... `)
    try {
      const cloudUrl = await uploadToCloudinary(row.image_url)

      const { error: upErr } = await supabase
        .from('announcements')
        .update({ image_url: cloudUrl })
        .eq('id', row.id)

      if (upErr) throw new Error(upErr.message)

      console.log(`✅ ${cloudUrl}`)
      ok++
    } catch (e) {
      console.log(`❌ ${e.message}`)
      fail++
    }

    // המתנה קצרה למנוע rate-limit
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n─────────────────────────────────────`)
  console.log(`✅ הועברו: ${ok}  ❌ נכשלו: ${fail}`)

  if (fail > 0) {
    console.log('\n⚠️  יש כשלונות — הרץ שוב את הסקריפט, הוא ידלג על מה שכבר עבר.')
  } else {
    console.log('\n🎉 מיגרציה הושלמה! כל התמונות עכשיו ב-Cloudinary.')
  }
}

migrate().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
