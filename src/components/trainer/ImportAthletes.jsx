import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'

const BRANCHES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'חולון' },
  { id: '22222222-2222-2222-2222-222222222222', name: 'תל אביב' },
]

// Map Hebrew / various formats → internal membership_type
const MEMBERSHIP_MAP = {
  '2': '2x_week', '2x': '2x_week', '2x_week': '2x_week',
  '2 פעמים': '2x_week', 'פעמיים': '2x_week',
  '4': '4x_week', '4x': '4x_week', '4x_week': '4x_week',
  '4 פעמים': '4x_week', 'ארבע': '4x_week',
  'unlimited': 'unlimited', 'ללא הגבלה': 'unlimited',
  'חופשי': 'unlimited', 'בלתי מוגבל': 'unlimited',
}

const MEMBERSHIP_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }

// Lookup table: any variant → internal field name
const HEADER_MAP = {
  'שם מלא': 'full_name', 'שם': 'full_name', 'name': 'full_name', 'full_name': 'full_name',
  'full name': 'full_name', 'fullname': 'full_name',
  'אימייל': 'email', 'מייל': 'email', 'email': 'email', 'e-mail': 'email',
  'טלפון': 'phone', 'פלאפון': 'phone', 'נייד': 'phone', 'phone': 'phone', 'mobile': 'phone',
  'סוג מנוי': 'membership_type', 'מנוי': 'membership_type',
  'membership': 'membership_type', 'membership_type': 'membership_type', 'subscription': 'membership_type',
  'קבוצה': 'group_name', 'group': 'group_name', 'group_name': 'group_name', 'כיתה': 'group_name',
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

export default function ImportAthletes({ onImported }) {
  const inputRef = useRef()
  const [show, setShow] = useState(false)
  const [branchId, setBranchId] = useState(BRANCHES[0].id)
  const [rows, setRows] = useState([])   // { full_name, email, phone, membership_type, group_name, errors[] }
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { saved, failed }

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
      alert('שגיאה בקריאת הקובץ: ' + err.message)
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
      branch_id: branchId,
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
    setBranchId(BRANCHES[0].id)
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-800 text-lg">ייבוא מתאמנים מקובץ</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
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
                  <div className="flex gap-2">
                    {BRANCHES.map(b => (
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
