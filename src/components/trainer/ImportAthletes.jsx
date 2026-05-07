import { useRef, useState, useEffect, useId } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useToast } from '../a11y'

// Map Hebrew / various formats → internal membership_type
const MEMBERSHIP_MAP = {
  '1': '1x_week', '1x': '1x_week', '1x_week': '1x_week',
  '1 פעם': '1x_week', 'פעם': '1x_week', 'פעם בשבוע': '1x_week',
  '2': '2x_week', '2x': '2x_week', '2x_week': '2x_week',
  '2 פעמים': '2x_week', 'פעמיים': '2x_week',
  '4': '4x_week', '4x': '4x_week', '4x_week': '4x_week',
  '4 פעמים': '4x_week', 'ארבע': '4x_week',
  'unlimited': 'unlimited', 'ללא הגבלה': 'unlimited',
  'חופשי': 'unlimited', 'בלתי מוגבל': 'unlimited',
}

const MEMBERSHIP_LABELS = { '1x_week': '1× שבוע', '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

// מיפוי שם חגורה עברי → ערך פנימי
const BELT_NAME_MAP = {
  'לבנה': 'kids_white', 'לבן': 'kids_white', 'white kids': 'kids_white',
  'אפורה לבנה': 'kids_gray_white', 'אפור לבן': 'kids_gray_white', 'אפורה-לבנה': 'kids_gray_white',
  'אפורה': 'kids_gray', 'אפור': 'kids_gray', 'gray': 'kids_gray', 'grey': 'kids_gray',
  'אפורה שחורה': 'kids_gray_black', 'אפור שחור': 'kids_gray_black', 'אפורה-שחורה': 'kids_gray_black',
  'צהובה לבנה': 'kids_yellow_white', 'צהוב לבן': 'kids_yellow_white', 'צהובה-לבנה': 'kids_yellow_white',
  'צהובה': 'kids_yellow', 'צהוב': 'kids_yellow', 'yellow': 'kids_yellow',
  'צהובה שחורה': 'kids_yellow_black', 'צהוב שחור': 'kids_yellow_black', 'צהובה-שחורה': 'kids_yellow_black',
  'כתומה לבנה': 'kids_orange_white', 'כתום לבן': 'kids_orange_white', 'כתומה-לבנה': 'kids_orange_white',
  'כתומה': 'kids_orange', 'כתום': 'kids_orange', 'orange': 'kids_orange',
  'כתומה שחורה': 'kids_orange_black', 'כתום שחור': 'kids_orange_black', 'כתומה-שחורה': 'kids_orange_black',
  'ירוקה לבנה': 'kids_green_white', 'ירוק לבן': 'kids_green_white', 'ירוקה-לבנה': 'kids_green_white',
  'ירוקה': 'kids_green', 'ירוק': 'kids_green', 'green': 'kids_green',
  'ירוקה שחורה': 'kids_green_black', 'ירוק שחור': 'kids_green_black', 'ירוקה-שחורה': 'kids_green_black',
  // בוגרים
  'לבנה בוגרים': 'white', 'white': 'white',
  'כחולה': 'blue', 'blue': 'blue',
  'סגולה': 'purple', 'purple': 'purple',
  'חומה': 'brown', 'brown': 'brown',
  'שחורה': 'black', 'black': 'black',
}

// Lookup table: any variant → internal field name
const HEADER_MAP = {
  'שם מלא': 'full_name', 'שם': 'full_name', 'name': 'full_name', 'full_name': 'full_name',
  'full name': 'full_name', 'fullname': 'full_name',
  'אימייל': 'email', 'מייל': 'email', 'email': 'email', 'e-mail': 'email',
  'טלפון': 'phone', 'פלאפון': 'phone', 'נייד': 'phone', 'phone': 'phone', 'mobile': 'phone',
  'סוג מנוי': 'membership_type', 'מנוי': 'membership_type',
  'membership': 'membership_type', 'membership_type': 'membership_type', 'subscription': 'membership_type',
  'קבוצה': 'group_name', 'group': 'group_name', 'group_name': 'group_name', 'כיתה': 'group_name',
  'תאריך לידה': 'birth_date', 'יום הולדת': 'birth_date', 'birth_date': 'birth_date', 'dob': 'birth_date', 'date of birth': 'birth_date',
  'חגורה': 'belt', 'belt': 'belt', 'חגורה נוכחית': 'belt',
  'תאריך חגורה': 'belt_received_at', 'תאריך קבלת חגורה': 'belt_received_at', 'belt date': 'belt_received_at',
  'קטגוריה': 'belt_category', 'category': 'belt_category', 'ילד/בוגר': 'belt_category',
}

function normalizeHeader(h) {
  const key = String(h).trim().toLowerCase().replace(/\s+/g, ' ')
  return HEADER_MAP[key] || key
}

function validateRow(row) {
  const errors = []
  if (!row.full_name?.trim()) errors.push('חסר שם מלא')
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('אימייל לא תקין')
  // membership_type is optional — defaults to '2x_week' if missing
  return errors
}

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (raw.length < 2) { resolve([]); return }

        console.log('📄 raw rows from file:', raw.length, 'total (including header)')
        console.log('📋 raw[0] (header row):', raw[0])
        console.log('📋 raw[1] (first data row):', raw[1])
        console.log('📋 raw[2] (second data row):', raw[2])

        // Map headers
        const headers = raw[0].map(normalizeHeader)
        console.log('🔑 normalized headers:', headers)

        const rows = raw.slice(1).filter(r => r.some(cell => cell !== ''))
        console.log('📊 non-empty data rows:', rows.length)

        const parsed = rows.map((r, i) => {
          const obj = {}
          headers.forEach((h, j) => { obj[h] = String(r[j] || '').trim() })

          const membershipRaw = (obj.membership_type || '').toLowerCase()
          obj.membership_type = MEMBERSHIP_MAP[membershipRaw] || null

          // חגורה: מיפוי עברי → ערך פנימי
          if (obj.belt) {
            const beltKey = obj.belt.trim().toLowerCase()
            obj.belt = BELT_NAME_MAP[beltKey] || BELT_NAME_MAP[obj.belt.trim()] || obj.belt
          }

          // קטגוריה: auto-detect מהחגורה אם לא נכתב מפורש
          if (!obj.belt_category && obj.belt) {
            obj.belt_category = obj.belt.startsWith('kids_') ? 'kids' : 'adult'
          }
          if (obj.belt_category) {
            const cat = obj.belt_category.trim().toLowerCase()
            obj.belt_category = (cat === 'ילד' || cat === 'ילדים' || cat === 'kids' || cat === 'kid') ? 'kids' : 'adult'
          }

          // תאריך לידה: Excel יכול לתת מספר serial או מחרוזת
          if (obj.birth_date) {
            const raw = obj.birth_date
            // Excel date serial
            if (/^\d+$/.test(raw) && Number(raw) > 10000) {
              const d = new Date(Math.round((Number(raw) - 25569) * 86400 * 1000))
              obj.birth_date = d.toISOString().slice(0, 10)
            } else {
              // DD/MM/YYYY or YYYY-MM-DD
              const m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
              if (m) {
                const y = m[3].length === 2 ? '20' + m[3] : m[3]
                const mo = m[2].padStart(2, '0')
                const d = m[1].padStart(2, '0')
                obj.birth_date = `${y}-${mo}-${d}`
              } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                // already ISO
              } else {
                obj.birth_date = null
              }
            }
          }

          // תאריך חגורה: אותו טיפול
          if (obj.belt_received_at) {
            const raw = obj.belt_received_at
            if (/^\d+$/.test(raw) && Number(raw) > 10000) {
              const d = new Date(Math.round((Number(raw) - 25569) * 86400 * 1000))
              obj.belt_received_at = d.toISOString().slice(0, 10)
            } else {
              const m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
              if (m) {
                const y = m[3].length === 2 ? '20' + m[3] : m[3]
                obj.belt_received_at = `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
              } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                obj.belt_received_at = null
              }
            }
          }

          return obj
        })

        console.log('✅ parsed rows (first 3):', parsed.slice(0, 3))
        console.log('✅ total parsed:', parsed.length)

        resolve(parsed)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default function ImportAthletes({ onImported, isAdmin = false }) {
  const toast = useToast()
  const inputRef = useRef()
  const dialogRef = useRef(null)
  const dialogTitleId = useId()
  const [show, setShow] = useState(false)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')

  useEffect(() => {
    let q = supabase.from('branches').select('id, name').order('name')
    if (!isAdmin) q = q.eq('hidden', false)
    q.then(({ data }) => {
      if (data?.length) {
        setBranches(data)
        setBranchId(p => p || data[0].id)
      }
    })
  }, [])
  const [rows, setRows] = useState([])   // { full_name, email, phone, membership_type, group_name, errors[] }
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { saved, failed }

  // א11y: ESC לסגירה + focus trap בסיסי + החזרת focus לאלמנט הקודם
  useEffect(() => {
    if (!show) return
    const previousFocus = document.activeElement
    const t = setTimeout(() => dialogRef.current?.focus(), 0)
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); handleClose() }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      const parsed = await parseFile(file)
      const withErrors = parsed.map((row, i) => ({
        ...row,
        errors: validateRow(row, i),
      }))
      setRows(withErrors)
      setResult(null)
    } catch (err) {
      toast.error('שגיאה בקריאת הקובץ: ' + err.message)
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  async function handleConfirm() {
    const valid = rows.filter(r => r.errors.length === 0)
    if (valid.length === 0) return

    setSaving(true)
    const payload = valid.map(r => ({
      full_name: r.full_name.trim(),
      email: r.email || null,
      phone: r.phone || null,
      membership_type: r.membership_type || '2x_week',
      subscription_type: r.membership_type || '2x_week',
      group_name: r.group_name || null,
      active: true,
      status: 'active',
      branch_id: branchId,
      birth_date: r.birth_date || null,
      belt: r.belt || null,
      belt_category: r.belt_category || 'kids',
      belt_received_at: r.belt_received_at || null,
      belt_stripes: 0,
      trains_gi: true,
    }))

    const { error } = await supabase.from('members').insert(payload)
    setSaving(false)

    if (error) {
      console.error('import error:', error)
      setResult({ saved: 0, failed: valid.length, error: error.message })
    } else {
      setResult({ saved: valid.length, failed: rows.length - valid.length })
      onImported?.()
    }
  }

  function handleClose() {
    setShow(false)
    setRows([])
    setResult(null)
    setBranchId(branches[0]?.id || '')
  }

  const validCount = rows.filter(r => r.errors.length === 0).length
  const invalidCount = rows.length - validCount

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className="border border-blue-600 text-blue-600 px-3 py-1.5 rounded-lg text-sm hover:bg-blue-50 transition"
      >
        ייבוא מ-Excel
      </button>

      {show && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={handleClose}
          dir="rtl"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 id={dialogTitleId} className="font-bold text-gray-800 text-lg">ייבוא מתאמנים מקובץ</h2>
              <button type="button" onClick={handleClose} aria-label="סגור חלון" className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                <span aria-hidden="true">✕</span>
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Result message */}
              {result && (
                <div className={`rounded-lg p-3 text-sm ${result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {result.error
                    ? `שגיאה בשמירה: ${result.error}`
                    : `✓ יובאו ${result.saved} מתאמנים בהצלחה${result.failed > 0 ? ` · ${result.failed} שורות דולגו` : ''}`
                  }
                </div>
              )}

              {/* Branch selector */}
              {!result && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">סניף</label>
                  <div className="flex gap-2 flex-wrap">
                    {branches.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBranchId(b.id)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                          branchId === b.id
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload area */}
              {!result && (
                <div
                  onClick={() => inputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                >
                  <div className="text-3xl mb-2">📂</div>
                  <p className="text-sm font-medium text-gray-700">לחץ לבחירת קובץ Excel או CSV</p>
                  <p className="text-xs text-gray-400 mt-1">עמודות נדרשות: שם מלא, אימייל, טלפון, סוג מנוי, קבוצה</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFile}
                  />
                </div>
              )}

              {/* Preview table */}
              {rows.length > 0 && !result && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{rows.length} שורות · <span className="text-green-600">{validCount} תקינות</span>{invalidCount > 0 && <span className="text-red-500"> · {invalidCount} עם שגיאות</span>}</span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">#</th>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">שם מלא</th>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">אימייל</th>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">טלפון</th>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">מנוי</th>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">קבוצה</th>
                          <th className="px-3 py-2 text-right text-gray-600 font-medium">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.map((row, i) => {
                          const hasError = row.errors.length > 0
                          return (
                            <tr key={i} className={hasError ? 'bg-red-50' : 'bg-white'}>
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className={`px-3 py-2 font-medium ${hasError && !row.full_name ? 'text-red-600' : 'text-gray-800'}`}>
                                {row.full_name || <span className="text-red-400 italic">חסר</span>}
                              </td>
                              <td className={`px-3 py-2 ${row.errors.includes('אימייל לא תקין') ? 'text-red-500' : 'text-gray-600'}`}>
                                {row.email || '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{row.phone || '—'}</td>
                              <td className="px-3 py-2 text-gray-600">
                                {MEMBERSHIP_LABELS[row.membership_type] ||
                                  <span className="text-gray-400 italic">ברירת מחדל (2× שבוע)</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{row.group_name || '—'}</td>
                              <td className="px-3 py-2">
                                {hasError
                                  ? <span className="text-red-500" title={row.errors.join(', ')}>⚠️ {row.errors.join(', ')}</span>
                                  : <span className="text-green-600">✓</span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex gap-2 justify-end">
              <button
                onClick={handleClose}
                className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50"
              >
                {result ? 'סגור' : 'ביטול'}
              </button>
              {rows.length > 0 && !result && (
                <button
                  onClick={handleConfirm}
                  disabled={saving || validCount === 0}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'שומר...' : `ייבא ${validCount} מתאמנים`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
