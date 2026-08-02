// תיבת אישור תנאי שימוש + קישור לעמוד /terms — מוצג לפני כל תשלום אמיתי באפליקציה
// (דרישת חברת הסליקה grow: "אישור תקנון בדף תשלום" + "לינק לתקנון בדף תשלום").

export const TERMS_VERSION = 'terms-2026-08'

export default function TermsAgreement({ checked, onChange }) {
  return (
    <label className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-emerald-600 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-emerald-500"
      />
      <span className="text-xs font-medium text-gray-700">
        קראתי ואני מסכים/ה ל
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline font-bold mx-1">
          תנאי השימוש
        </a>
        של TeamPact, לרבות מדיניות התשלום והביטול.
      </span>
    </label>
  )
}
