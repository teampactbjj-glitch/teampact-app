import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast, useConfirm } from '../a11y'
import { ADULT_BELTS, KIDS_BELTS, getBeltLabel, getMaxStripes, formatHebrewMonthYear } from '../../lib/belts'

// ============================================================
// BeltHistoryEditor — עריכת היסטוריית חגורות של מתאמן (שלב 3)
// ============================================================
// מציג טבלה של כל השורות ב-belt_history של memberId, עם אפשרות:
//   - הוספת שורה חדשה (source='manual')
//   - מחיקת שורה
//   - עדכון תאריך/חגורה/פסים
// המקור 'promotion' מסומן בלייבל מיוחד (קודם דרך אירוע) — אסור לעדכן/למחוק
// כדי לא לפגום בעקיבות. מקורות 'import'/'manual' ניתנים לעריכה חופשית.
// ============================================================

const SOURCE_LABEL = {
  import: '📥 ייבוא',
  promotion: '🏆 אירוע קידום',
  manual: '✍️ ידני',
}

export default function BeltHistoryEditor({ memberId, memberName, memberCategory = 'adult' }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({ belt: '', belt_stripes: 0, received_at: '', notes: '' })
  const toast = useToast()
  const confirm = useConfirm()

  const beltOptions = memberCategory === 'kids' ? KIDS_BELTS : ADULT_BELTS

  const reload = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('belt_history')
        .select('id, belt, belt_stripes, received_at, source, event_id, notes, created_at')
        .eq('member_id', memberId)
        .order('received_at', { ascending: true })
      if (error) {
        console.warn('[BeltHistory] load error:', error.message)
        toast?.error('שגיאה בטעינת ההיסטוריה')
        return
      }
      setRows(data || [])
    } finally {
      setLoading(false)
    }
  }, [memberId, toast])

  useEffect(() => { reload() }, [reload])

  async function handleAdd() {
    if (!newRow.belt || !newRow.received_at) {
      toast?.error('חובה לבחור חגורה ותאריך')
      return
    }
    const { error } = await supabase.from('belt_history').upsert({
      member_id: memberId,
      belt: newRow.belt,
      belt_stripes: newRow.belt_stripes || 0,
      received_at: newRow.received_at,
      source: 'manual',
      notes: newRow.notes || null,
    }, {
      onConflict: 'member_id,belt,belt_stripes',
      ignoreDuplicates: false, // עדכון אם קיים
    })
    if (error) {
      toast?.error('שגיאה: ' + error.message)
      return
    }
    toast?.success('נוספה שורה להיסטוריה')
    setAdding(false)
    setNewRow({ belt: '', belt_stripes: 0, received_at: '', notes: '' })
    reload()
  }

  async function handleUpdate(id, patch) {
    const { error } = await supabase.from('belt_history').update(patch).eq('id', id)
    if (error) {
      toast?.error('שגיאה: ' + error.message)
      return
    }
    reload()
  }

  async function handleDelete(row) {
    if (row.source === 'promotion') {
      toast?.error('לא ניתן למחוק שורת קידום (משויכת לאירוע)')
      return
    }
    const ok = await confirm({
      title: 'מחיקת שורת היסטוריה',
      message: `למחוק את ${getBeltLabel(row.belt)} (${formatHebrewMonthYear(row.received_at)})?`,
    })
    if (!ok) return
    const { error } = await supabase.from('belt_history').delete().eq('id', row.id)
    if (error) {
      toast?.error('שגיאה במחיקה: ' + error.message)
      return
    }
    toast?.success('נמחק')
    reload()
  }

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">📜 היסטוריית חגורות{memberName ? ` · ${memberName}` : ''}</h4>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="bg-amber-600 text-white px-2 py-1 rounded text-xs hover:bg-amber-700">
            + הוסף שורה
          </button>
        )}
      </div>

      {loading ? (
        <p className="p-3 text-xs text-gray-500">טוען...</p>
      ) : (
        <div className="divide-y">
          {rows.length === 0 && !adding && (
            <p className="p-3 text-xs text-gray-500 text-center">אין רשומות היסטוריה. לחץ "+ הוסף שורה" כדי להוסיף.</p>
          )}

          {rows.map(r => (
            <div key={r.id} className="p-2 grid grid-cols-12 gap-2 text-xs items-center">
              <div className="col-span-4">
                <select disabled={r.source === 'promotion'}
                  className="w-full border rounded px-1 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                  value={r.belt}
                  onChange={e => handleUpdate(r.id, { belt: e.target.value })}>
                  {beltOptions.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <input type="date" disabled={r.source === 'promotion'}
                  className="w-full border rounded px-1 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400"
                  value={r.received_at}
                  onChange={e => handleUpdate(r.id, { received_at: e.target.value })} />
              </div>
              <div className="col-span-3 text-[10px] text-gray-500">
                {SOURCE_LABEL[r.source] || r.source}
              </div>
              <div className="col-span-1 text-end">
                <button type="button" disabled={r.source === 'promotion'}
                  onClick={() => handleDelete(r)}
                  className="text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed text-xs">
                  🗑
                </button>
              </div>
            </div>
          ))}

          {adding && (
            <div className="p-2 bg-amber-50/50 grid grid-cols-12 gap-2 text-xs items-center">
              <div className="col-span-5">
                <select className="w-full border rounded px-1 py-1 text-xs"
                  value={newRow.belt}
                  onChange={e => setNewRow(p => ({ ...p, belt: e.target.value, belt_stripes: 0 }))}>
                  <option value="">— חגורה —</option>
                  {beltOptions.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <input type="date" className="w-full border rounded px-1 py-1 text-xs"
                  value={newRow.received_at}
                  onChange={e => setNewRow(p => ({ ...p, received_at: e.target.value }))} />
              </div>
              <div className="col-span-3 flex gap-1 justify-end">
                <button type="button" onClick={handleAdd}
                  className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                  ✓ שמור
                </button>
                <button type="button" onClick={() => { setAdding(false); setNewRow({ belt: '', belt_stripes: 0, received_at: '', notes: '' }) }}
                  className="border px-2 py-1 rounded text-xs hover:bg-gray-100">
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
