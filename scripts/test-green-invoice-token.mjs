// בדיקה חד-פעמית: מוודא שה-API ID / Secret של חשבונית ירוקה עובדים בפועל.
// לא יוצר חשבונית, לא גובה כסף — רק מבקש טוקן אימות.
//
// הרצה: node scripts/test-green-invoice-token.mjs
// קורא את הערכים מהקובץ .env.green-invoice.local (בשורש הפרויקט) — לא משורת הפקודה,
// כדי להימנע מבעיות עם תווים מיוחדים (כמו !) שה-shell מפרש בצורה שגויה.
//
// תוכן הקובץ .env.green-invoice.local צריך להיראות כך (שתי שורות בלבד):
// GREEN_INVOICE_API_ID=כאן-המזהה
// GREEN_INVOICE_API_SECRET=כאן-הסיקרט

import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.green-invoice.local')

let id = process.env.GREEN_INVOICE_API_ID
let secret = process.env.GREEN_INVOICE_API_SECRET

if ((!id || !secret) && existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key === 'GREEN_INVOICE_API_ID') id = value
    if (key === 'GREEN_INVOICE_API_SECRET') secret = value
  }
}

if (!id || !secret) {
  console.error(`חסר GREEN_INVOICE_API_ID או GREEN_INVOICE_API_SECRET.\nצור קובץ בנתיב: ${envPath}\nעם שתי שורות:\nGREEN_INVOICE_API_ID=...\nGREEN_INVOICE_API_SECRET=...`)
  process.exit(1)
}

const res = await fetch('https://api.greeninvoice.co.il/api/v1/account/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id, secret }),
})

console.log('HTTP status:', res.status)
const text = await res.text()
console.log('תשובת השרת:', text)

if (res.ok) {
  console.log('\n✅ החיבור עובד — התקבל טוקן אמיתי מחשבונית ירוקה.')
} else {
  console.log('\n❌ החיבור נכשל — תעתיק לי את השורות למעלה (status + תשובת השרת) ונאבחן לפי זה.')
}
