/**
 * CustomDiscountLink — לינקי הרשמה עם הנחה (חולון קאנטרי)
 * גישה: מנהל בלבד (isAdmin נאכף ב-TrainerDashboard לפני רינדור)
 *
 * ✅ 06.08.2026 (פיבוט) — המסלול הראשי הוא 2 לינקים קבועים ונסתרים ל-RegisterPage
 * (?discount=member / ?discount=employee, ראו DISCOUNT_LINKS ב-RegisterPage.jsx):
 * המתאמן ממלא בעצמו את הפרטים (שם/טלפון/סוג מנוי) כמו בהרשמה רגילה, הסניף וההנחה
 * נקבעים אוטומטית לפי הלינק, והתשלום נגבה כבר בסכום המוזל. "אישור ההנחה" של דודי
 * הוא פשוט הבחירה איזה לינק לשלוח — ורק לאחר שוידא בעצמו שהאדם באמת מנוי/עובד.
 * שום מקום ציבורי לא חושף ששני המסלולים האלה קיימים בכלל.
 *
 * הטופס למטה ("מקרה חד-פעמי") הוא fallback בלבד — למקרים לא-סטנדרטיים (אחוז הנחה
 * שונה, מחיר מיוחד וכו') שבהם דודי כן מזין את הפרטים בעצמו וישלח לינק אישי ידנית.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const DEFAULT_SUB_PRICE = {
  '1x_week':   200,
  '2x_week':   365,
  '4x_week':   500,
  'unlimited': 600,
}

const SUB_LABELS = {
  '1x_week':   '1× שבוע',
  '2x_week':   '2× שבוע',
  '4x_week':   '4× שבוע',
  'unlimited': 'ללא הגבלה',
}

const SUB_TYPES = ['1x_week', '2x_week', '4x_week', 'unlimited']

const DISCOUNT_OPTIONS = [
  { value: 'none',                 label: 'ללא הנחה (מחיר מלא)',        pct: 0  },
  { value: 'country_club_member',  label: 'מנוי קאנטרי — 20% הנחה',     pct: 20 },
  { value: 'employee_family',      label: 'עובד קאנטרי/משפחה — 50% הנחה', pct: 50 },
]

// שני הלינקים הקבועים (ראו DISCOUNT_LINKS ב-RegisterPage.jsx — חייבים להישאר תואמים)
const FIXED_LINKS = [
  { key: 'member',   pct: 20, label: 'מנוי קאנטרי',                emoji: '🏅' },
  { key: 'employee', pct: 50, label: 'עובד/ת קאנטרי + בני משפחה',  emoji: '👔' },
]

const fmt = n => '₪' + Math.round(n).toLocaleString('he-IL')

function waPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  if (digits.startsWith('972')) return digits
  return digits
}

function FixedLinkCard({ link }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/register?discount=${link.key}`
  const waMessage = `שלום! הנה לינק הרשמה מיוחד ל-TeamPact חולון קאנטרי — פשוט למלא את הפרטים שלך:\n${url}`

  function copy() {
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">{link.emoji} {link.label}</span>
        <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
          {link.pct}% הנחה
        </span>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs break-all text-gray-600 select-all">
        {url}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={copy}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg py-2 text-sm transition-colors">
          {copied ? '✓ הועתק' : '📋 העתק לינק'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg py-2 text-sm transition-colors">
          💬 שתף בווצאפ
        </a>
      </div>
    </div>
  )
}

function OneOffTool({ isAdmin }) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [subscriptionType, setSubscriptionType] = useState('2x_week')
  const [discountType, setDiscountType] = useState('country_club_member')
  const [discountValidUntil, setDiscountValidUntil] = useState('')
  const [branchPrice, setBranchPrice] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return
    supabase.from('branches').select('id, name, requires_facility_waiver')
      .eq('hidden', false)
      .then(({ data }) => {
        const list = data || []
        setBranches(list)
        const cc = list.find(b => b.requires_facility_waiver)
        if (cc) setBranchId(cc.id)
      })
  }, [open])

  useEffect(() => {
    if (!branchId || !subscriptionType) { setBranchPrice(null); return }
    supabase.from('branch_subscription_prices').select('price')
      .eq('branch_id', branchId).eq('subscription_type', subscriptionType)
      .maybeSingle()
      .then(({ data }) => setBranchPrice(data?.price ?? null))
  }, [branchId, subscriptionType])

  const basePrice = branchPrice ?? DEFAULT_SUB_PRICE[subscriptionType] ?? 0
  const discountPct = DISCOUNT_OPTIONS.find(o => o.value === discountType)?.pct || 0
  const finalPrice = Math.round(basePrice * (1 - discountPct / 100))

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setResult(null)

    if (!fullName.trim()) { setError('חובה להזין שם מלא'); return }
    if (!phone.trim()) { setError('חובה להזין טלפון'); return }
    if (!branchId) { setError('חובה לבחור סניף'); return }
    if (finalPrice <= 0) { setError('לא נמצא מחיר תקין עבור הסניף/סוג המנוי הזה'); return }

    setLoading(true)
    try {
      const registrationPaymentRef = crypto.randomUUID()

      const { data: inserted, error: insErr } = await supabase.from('members').insert({
        full_name: fullName.trim(),
        phone: phone.trim(),
        branch_ids: [branchId],
        branch_id: branchId,
        subscription_type: subscriptionType,
        membership_type: subscriptionType,
        status: 'pending',
        active: false,
        payment_status: 'unpaid',
        discount_pct: discountPct,
        discount_type: discountType === 'none' ? null : discountType,
        discount_valid_until: discountValidUntil || null,
        registration_payment_ref: registrationPaymentRef,
      }).select().single()
      if (insErr) throw insErr

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('green-invoice-create-payment-link', {
        body: {
          type: 'subscription',
          reference_id: registrationPaymentRef,
          amount: finalPrice,
          description: `הרשמה למנוי — TeamPact חולון קאנטרי (${fullName.trim()})`,
          customer_name: fullName.trim(),
          customer_phone: phone.trim(),
        },
      })
      if (fnErr || !fnData?.payment_url) {
        throw new Error(fnData?.error || fnErr?.message || 'יצירת לינק התשלום נכשלה')
      }

      setResult({
        payment_url: fnData.payment_url,
        finalPrice,
        fullName: fullName.trim(),
        phone: phone.trim(),
        memberId: inserted?.id,
      })
    } catch (err) {
      console.error('CustomDiscountLink error:', err)
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setResult(null)
    setFullName('')
    setPhone('')
    setDiscountValidUntil('')
    setError('')
  }

  const waMessage = result
    ? `שלום ${result.fullName}, זה הלינק לתשלום עבור המנוי ב-TeamPact חולון קאנטרי:\n${result.payment_url}`
    : ''

  if (!isAdmin) return null

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-right text-sm font-bold text-gray-600 hover:text-gray-800 flex items-center justify-between px-1 py-2">
        <span>⚙️ מקרה חד-פעמי / הנחה לא-סטנדרטית</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        !result ? (
          <form onSubmit={handleCreate} className="space-y-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">שם מלא</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="לדוגמה: ישראל ישראלי" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">טלפון</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="050-0000000" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">סניף</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}{b.requires_facility_waiver ? ' (קאנטרי)' : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">סוג מנוי</label>
              <select value={subscriptionType} onChange={e => setSubscriptionType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {SUB_TYPES.map(t => <option key={t} value={t}>{SUB_LABELS[t]}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">סוג הנחה</label>
              <select value={discountType} onChange={e => setDiscountType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {DISCOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {discountType !== 'none' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">בתוקף עד (לפי כרטיס/אישור הקאנטרי)</label>
                <input type="date" value={discountValidUntil} onChange={e => setDiscountValidUntil(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">אם ריק — ההנחה בתוקף לצמיתות. אחרי התאריך המחיר חוזר אוטומטית למלא.</p>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-700">מחיר סופי לתשלום</span>
              <span className="text-lg font-black text-emerald-700">
                {fmt(finalPrice)}
                {discountPct > 0 && <span className="text-xs font-normal text-gray-400 line-through mr-2">{fmt(basePrice)}</span>}
              </span>
            </div>

            {error && <div className="text-sm text-red-600 font-bold">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg py-2.5 text-sm transition-colors">
              {loading ? 'יוצר לינק...' : 'צור לינק תשלום'}
            </button>
          </form>
        ) : (
          <div className="space-y-4 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-sm text-gray-700">
              נוצרה שורה עבור <span className="font-bold">{result.fullName}</span> ({result.phone}) —
              סכום לתשלום: <span className="font-bold text-emerald-700">{fmt(result.finalPrice)}</span>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs break-all text-gray-600 select-all">
              {result.payment_url}
            </div>

            <div className="flex gap-2">
              <button type="button"
                onClick={() => navigator.clipboard?.writeText(result.payment_url)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-lg py-2.5 text-sm transition-colors">
                📋 העתק לינק
              </button>
              <a href={`https://wa.me/${waPhone(result.phone)}?text=${encodeURIComponent(waMessage)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg py-2.5 text-sm transition-colors">
                💬 שלח בווצאפ
              </a>
            </div>

            <button type="button" onClick={resetForm}
              className="w-full border border-gray-300 text-gray-600 font-bold rounded-lg py-2 text-sm hover:bg-gray-50 transition-colors">
              + לינק חדש
            </button>
          </div>
        )
      )}
    </div>
  )
}

export default function CustomDiscountLink({ isAdmin }) {
  // ✅ 11.08.2026 — דודי ביקש שהבלוק הזה יתקפל כמו כל שאר האזורים בדשבורד (למשל "בקשות
  // ממתינות" ב-TodayClasses.jsx), כי הוא היה פתוח קבוע וממלא מקום בראש טאב "מתאמנים"
  // גם כשלא צריך אותו. סגור כברירת מחדל — נפתח רק בלחיצה, בדיוק כמו התבנית הקיימת.
  const [open, setOpen] = useState(false)

  if (!isAdmin) {
    return <div className="p-6 text-center text-red-600 font-bold" dir="rtl">⛔ גישה מורשית למנהל בלבד</div>
  }

  return (
    <div dir="rtl" className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-right">
        <span className="font-bold text-gray-900 text-sm">🔗 לינקי הרשמה עם הנחה — חולון קאנטרי</span>
        <span className="text-emerald-700 text-lg">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-3 mt-3">
          <p className="text-xs text-gray-500 -mt-1">
            שולחים רק לאחר שוידאת שהאדם באמת מנוי/עובד קאנטרי. הוא ממלא את הפרטים שלו בעצמו; ההנחה כבר מובנית בלינק ולא נחשפת בשום מקום ציבורי.
          </p>

          <div className="space-y-3">
            {FIXED_LINKS.map(link => <FixedLinkCard key={link.key} link={link} />)}
          </div>

          <div className="border-t border-emerald-200 pt-2">
            <OneOffTool isAdmin={isAdmin} />
          </div>
        </div>
      )}
    </div>
  )
}
