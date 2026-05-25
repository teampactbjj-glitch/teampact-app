/**
 * fix-cache-headers.mjs
 *
 * סקריפט חד-פעמי — מוסיף cacheControl לכל התמונות הקיימות ב-Storage.
 * מריץ פעם אחת, ואחר כך אפשר למחוק.
 *
 * הרצה: node fix-cache-headers.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pnicoluujpidguvniwub.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaWNvbHV1anBpZGd1dm5pd3ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MTY2NjUsImV4cCI6MjA5MTI5MjY2NX0.I7bRbvy1eU-W3MrlHuB93v2nGffsA9oiapfaa3SX6nM'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const BUCKETS = ['products', 'images']
const CACHE_CONTROL = '31536000' // שנה

async function listAllFiles(bucket, folder = '') {
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 })
  if (error) { console.error(`  שגיאה ב-list (${bucket}/${folder}):`, error.message); return [] }
  if (!data) return []

  const files = []
  for (const item of data) {
    if (item.id) {
      // קובץ
      files.push(folder ? `${folder}/${item.name}` : item.name)
    } else {
      // תיקייה — נרד לתוכה
      const nested = await listAllFiles(bucket, folder ? `${folder}/${item.name}` : item.name)
      files.push(...nested)
    }
  }
  return files
}

async function fixBucket(bucket) {
  console.log(`\n📦 Bucket: ${bucket}`)
  const files = await listAllFiles(bucket)

  if (files.length === 0) {
    console.log('  אין קבצים.')
    return
  }

  console.log(`  נמצאו ${files.length} קבצים`)

  let success = 0, failed = 0

  for (const path of files) {
    process.stdout.write(`  ↻ ${path} ... `)

    // הורדה
    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path)
    if (dlErr) {
      console.log(`❌ הורדה נכשלה: ${dlErr.message}`)
      failed++
      continue
    }

    // העלאה מחדש עם cache header
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, {
      cacheControl: CACHE_CONTROL,
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
    })

    if (upErr) {
      console.log(`❌ העלאה נכשלה: ${upErr.message}`)
      failed++
    } else {
      console.log('✅')
      success++
    }
  }

  console.log(`  סיכום: ${success} הצליחו, ${failed} נכשלו`)
}

async function main() {
  console.log('🔧 מתחיל תיקון Cache Headers לתמונות קיימות...\n')
  for (const bucket of BUCKETS) {
    await fixBucket(bucket)
  }
  console.log('\n✅ הושלם!')
}

main().catch(console.error)
