import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useToast } from '../a11y'
import { ADULT_BELTS, parseHebrewMonthYear, getBeltLabel } from '../../lib/belts'

// סדר החגורות מהנמוכה לגבוהה — למצוא את האחרונה שמולאה
const BELT_PROGRESSION = [
  { value: 'white',   keys: ['חגורה לבנה', 'לבנה', 'white'] },
  { value: 'blue',    keys: ['חגורה כחולה', 'כחולה', 'blue'] },
  { value: 'purple',  keys: ['חגורה סגולה', 'סגולה', 'purple'] },
  { value: 'brown',   keys: ['חגורה חומה', 'חומה', 'brown'] },
  { value: 'black',   keys: ['חגורה שחורה', 'שחורה', 'black'] },
  { value: 'black_1', keys: ['דאן 1', 'דן 1', 'dan 1'] },
  { value: 'black_2', keys: ['דאן 2', 'דן 2', 'dan 2'] },
  { value: 'black_3', keys: ['דאן 3', 'דן 3', 'dan 3'] },
  { value: 'black_4', keys: ['דאן 4', 'דן 4', 'dan 4'] },
  { value: 'black_5', keys: ['דאן 5', 'דן 5', 'dan 5'] },
  { value: 'black_6', keys: ['דאן 6', 'דן 6', 'dan 6'] },
]

const NAME_KEYS = ['שם', 'שם מלא', 'name', 'full_name']

function normalizeName(s) {
  if (!s) return ''
  return String(s)
    .replace(/[֑-ׇ]/g, '')   // remove Hebrew diacritics
    .replace(/["'`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Levenshtein distance
function lev(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const m = []
  for (let i = 0; i <= b.length; i++) m[i] = [i]
  for (let j = 0; j <= a.length; j++) m[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1
    }
  }
  return m[b.length][a.length]
}

// Returns 0-1 similarity
function nameSimilarity(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // נסה גם reversed (אדמיר ב' כהן vs כהן אדמיר)
  const naRev = na.split(' ').reverse().join(' ')
  const distA = lev(na, nb)
  const distB = lev(naRev, nb)
  const dist = Math.min(distA, distB)
  const maxLen = Math.max(na.length, nb.length)
  return 1 - dist / maxLen
}

function findBestMatch(csvName, existingAthletes) {
  let best = null
  let bestScore = 0
  for (const a of existingAthletes) {
    const score = nameSimilarity(csvName, a.full_name)
    if (score > bestScore) { bestScore = score; best = a }
  }
  return { athlete: best, score: bestScore }
}

function findHeaderIndex(headers, keys) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim().toLowerCase()
    for (const k of keys) {
      if (h === k.toLowerCase() || h.includes(k.toLowerCase())) return i
    }
  }
  return -1
}

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        if (!raw.length) { resolve([]); return }
        const headers = raw[0]
        const rows = raw.slice(1).filter(r => r.some(c => String(c).trim()))
        resolve({ headers, rows })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function processRows(headers, rows) {
  const nameIdx = findHeaderIndex(headers, NAME_KEYS)
  if (nameIdx === -1) {
    return { error: 'לא נמצאה עמודת "שם" בקובץ' }
  }

  // Map each progression belt → column index
  const beltCols = BELT_PROGRESSION.map(b => ({
    ...b,
    colIdx: findHeaderIndex(headers, b.keys),
  }))

  const results = rows.map(row => {
    const csvName = String(row[nameIdx] || '').trim()
    if (!csvName) return null

    // Walk progression from highest to lowest, pick first non-empty
    let currentBelt = null
    let currentDate = null
    let whiteDate = null

    for (let i = beltCols.length - 1; i >= 0; i--) {
      const bc = beltCols[i]
      if (bc.colIdx === -1) continue
      const cell = row[bc.colIdx]
      const parsed = parseHebrewMonthYear(cell)
      if (parsed) {
        if (!currentBelt) {
          currentBelt = bc.value
          currentDate = parsed
        }
        if (bc.value === 'white') {
          whiteDate = parsed
        }
      }
    }

    return {
      csvName,
      currentBelt,
      currentDate,
      whiteDate,
      raw: beltCols.reduce((acc, bc) => {
        if (bc.colIdx !== -1) acc[bc.value] = row[bc.colIdx]
        return acc
      }, {}),
    }
  }).filter(Boolean)

  return { results }
}

export default function ImportBelts({ onImported, existingAthletes = [] }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('upload') // 'upload' | 'preview' | 'done'
  const [parsed, setParsed] = useState(null)
  const [matches, setMatches] = useState([])      // [{ csvName, currentBelt, currentDate, whiteDate, athleteId, action }]
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [doneCount, setDoneCount] = useState(0)
  const fileRef = useRef(null)
  const toast = useToast()

  function reset() {
    setStep('upload')
    setParsed(null)
    setMatches([])
    setErrorMsg('')
    setDoneCount(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFile(e) {
    setErrorMsg('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { headers, rows } = await parseFile(file)
      const out = processRows(headers, rows)
      if (out.error) { setErrorMsg(out.error); return }
      setParsed(out.results)

      // Auto-match with existing athletes
      const initial = out.results.map(r => {
        const { athlete, score } = findBestMatch(r.csvName, existingAthletes)
        return {
          ...r,
          athleteId: score >= 0.85 ? (athlete?.id || '') : '',
          score,
          action: score >= 0.85 ? 'update' : (score >= 0.6 ? 'review' : 'skip'),
        }
      })
      setMatches(initial)
      setStep('preview')
    } catch (err) {
      setErrorMsg('שגיאה בקריאת הקובץ: ' + (err?.message || err))
    }
  }

  function setMatchField(idx, field, value) {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }

  async function commit() {
    setSaving(true)
    setErrorMsg('')
    let success = 0
    const failures = []

    for (const m of matches) {
      if (m.action !== 'update' || !m.athleteId || !m.currentBelt) continue
      const payload = {
        belt: m.currentBelt,
        belt_received_at: m.currentDate,
        belt_category: 'adult',
        bjj_start_date: m.whiteDate || null,
        trains_gi: true,
        belt_stripes: 0,
      }
      const { error } = await supabase.from('members').update(payload).eq('id', m.athleteId)
      if (error) failures.push(`${m.csvName}: ${error.message}`)
      else success++
    }

    setSaving(false)
    setDoneCount(success)
    if (failures.length) {
      setErrorMsg(`עודכנו ${success}, נכשלו ${failures.length}:\n` + failures.slice(0, 5).join('\n'))
    } else {
      toast.success(`עודכנו ${success} חגורות בהצלחה`)
    }
    setStep('done')
    onImported?.()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-700">
        🥋 ייבוא חגורות
      </button>
    )
  }

  const updateCount = matches.filter(m => m.action === 'update' && m.athleteId && m.currentBelt).length
  const reviewCount = matches.filter(m => m.action === 'review').length
  const skipCount = matches.filter(m => m.action === 'skip').length

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b p-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">🥋 ייבוא חגורות מקובץ</h3>
          <button onClick={() => { setOpen(false); reset() }}
            className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto p-4 flex-1">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="text-sm text-gray-600 space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="font-medium text-amber-900">📋 פורמט הקובץ הצפוי:</p>
                <p>עמודה 1: <strong>שם</strong> — שם מלא של המתאמן</p>
                <p>עמודות נוספות (כל אחת אופציונלית): <strong>חגורה לבנה</strong>, <strong>חגורה כחולה</strong>, <strong>חגורה סגולה</strong>, <strong>חגורה חומה</strong>, <strong>חגורה שחורה</strong>, <strong>דאן 1</strong>...</p>
                <p>תאריכים בפורמט עברי: "ינואר 2012", "יוני 2018", או 06/2018, או 2018.</p>
                <p className="text-xs text-amber-800 mt-2">המערכת תזהה אוטומטית את החגורה הגבוהה ביותר שמולאה ותעדכן את המתאמן.</p>
              </div>

              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls"
                onChange={handleFile}
                className="block w-full text-sm border rounded-lg p-2" />

              {errorMsg && <p className="text-red-600 text-sm bg-red-50 rounded p-2 whitespace-pre-line">{errorMsg}</p>}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <span className="bg-green-100 text-green-800 px-2 py-1 rounded">✓ עדכון: {updateCount}</span>
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">⚠️ לבדיקה: {reviewCount}</span>
                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">⏭️ דלג: {skipCount}</span>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-right">שם בקובץ</th>
                      <th className="p-2 text-right">התאמה</th>
                      <th className="p-2 text-right">חגורה</th>
                      <th className="p-2 text-right">תאריך</th>
                      <th className="p-2 text-right">פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m, i) => (
                      <tr key={i} className={`border-t ${
                        m.action === 'update' ? 'bg-green-50/40'
                          : m.action === 'review' ? 'bg-yellow-50/40' : 'bg-gray-50/30'
                      }`}>
                        <td className="p-2">{m.csvName}</td>
                        <td className="p-2">
                          <select className="border rounded px-1 py-0.5 text-xs max-w-[150px]"
                            value={m.athleteId}
                            onChange={e => {
                              setMatchField(i, 'athleteId', e.target.value)
                              if (e.target.value) setMatchField(i, 'action', 'update')
                            }}>
                            <option value="">— לא משויך —</option>
                            {existingAthletes
                              .slice()
                              .sort((a, b) => nameSimilarity(m.csvName, b.full_name) - nameSimilarity(m.csvName, a.full_name))
                              .slice(0, 30)
                              .map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.full_name} {a.id === m.athleteId ? `(${Math.round(m.score * 100)}%)` : ''}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="p-2">{m.currentBelt ? getBeltLabel(m.currentBelt) : '—'}</td>
                        <td className="p-2">{m.currentDate || '—'}</td>
                        <td className="p-2">
                          <select className="border rounded px-1 py-0.5 text-xs"
                            value={m.action}
                            onChange={e => setMatchField(i, 'action', e.target.value)}>
                            <option value="update">עדכן</option>
                            <option value="review">סקור</option>
                            <option value="skip">דלג</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {errorMsg && <p className="text-red-600 text-sm bg-red-50 rounded p-2 whitespace-pre-line">{errorMsg}</p>}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <div className="text-5xl mb-3">✅</div>
              <p className="font-medium text-gray-800">עודכנו {doneCount} חגורות בהצלחה</p>
              {errorMsg && <p className="text-red-600 text-sm bg-red-50 rounded p-2 mt-3 whitespace-pre-line">{errorMsg}</p>}
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2 justify-end bg-gray-50">
          {step === 'preview' && (
            <button onClick={commit} disabled={saving || updateCount === 0}
              className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50">
              {saving ? 'מעדכן...' : `עדכן ${updateCount} מתאמנים`}
            </button>
          )}
          <button onClick={() => { setOpen(false); reset() }}
            className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-100">
            {step === 'done' ? 'סגור' : 'ביטול'}
          </button>
        </div>
      </div>
    </div>
  )
}
