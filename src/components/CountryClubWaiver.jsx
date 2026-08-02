import { Field } from './a11y'

// גרסת הנוסח — לשמירה יחד עם כל חתימה (club_waivers.waiver_version), כדי שאם הנוסח
// ישתנה בעתיד יהיה ברור על איזו גרסה בדיוק חתם כל אדם.
export const WAIVER_VERSION = 'appendix-d-2026-07'

// נוסח ההצהרה — מבוסס במדויק על נספח ד' להסכם השכירות מול מרכז הספורט בחולון
// ("נוהל כניסת לקוחות חיצוניים שאינם מנויים" + "טופס התחייבות", 26.07.2026),
// מנוסח בגוף ראשון לצורך חתימה דיגיטלית. סעיף 8 (הרשאת חיוב) הוא תוספת של TeamPact
// שלא קיימת בנוסח הקאנטרי עצמו, ומיועדת להעביר לחתום את העלות שהקאנטרי מטיל על
// דודי בן זקן / TeamPact בפועל, במקרה של הפרת הסעיפים 1-7.
export const WAIVER_TEXT = [
  'הכניסה למרכז הספורט בחולון תתבצע עם כרטיס/רישום כניסה הכולל את פרטי היום ושעות פעילות החוג. באיחור ביציאה מהחוג מעבר לזמן שנקבע, אדרש לתשלום דמי כניסה למרכז הספורט.',
  'במקרים חוזרים של איחור ביציאה — כניסתי (וכניסת מי שמלווה אותי) עלולה להיאסר לחלוטין, וייחשב הדבר כהפרת התחייבותי לפי מסמך זה.',
  'עבור ילד/ה מתחת לגיל 12 — יורשה מלווה אחד בלבד ללא תשלום נוסף. מלווה נוסף מחויב בתשלום כרטיס כניסה משלו.',
  'אני מתחייב/ת לצאת (ולוודא שמי שמלווה אותי יוצא) משטח מרכז הספורט מיד בתום השיעור. איחור מעבר ל-30 דקות מתום השיעור יגרור חיוב בתשלום כרטיסי כניסה עבורי ועבור מלווה, כפי שדורש מרכז הספורט.',
  'ככל שיש צורך בהמתנה לפני או אחרי השיעור — אני ומי שמלווה אותי נמתין באולם טניס השולחן בלבד, ולא באזורים אחרים במרכז הספורט.',
  'ידוע לי כי השימוש במתקני מרכז הספורט — לרבות בריכת השחייה, חדר הכושר וכל מתקן אחר שאינו חוג ה-MMA/הג\'יו־ג\'יטסו/האיגרוף התאילנדי — אסור עליי בהחלט, אלא אם אני מנוי/ה רשמי/ת של מרכז הספורט (הקאנטרי) או שרכשתי כרטיסייה נפרדת למתקן הרלוונטי. אני מתחייב/ת שלא לעשות שימוש במתקנים אלו בניגוד לאמור.',
  'ידוע לי שהפרת התחייבות זו עלולה לפגוע בהסכם שבין TeamPact לבין מרכז הספורט, ולהביא להגבלה או הפסקה של האפשרות שלי (ושל מי מטעמי) להיכנס למרכז הספורט ולהשתתף בחוגים.',
  'מאחר שעל פי ההסכם שבין TeamPact לבין מרכז הספורט, כל עלות שנגרמת עקב איחור ביציאה או שימוש אסור במתקנים כאמור בסעיפים 1-6 מוטלת על TeamPact ולא עליי ישירות — הריני מסמיך/ה בזאת את TeamPact (דודי בן זקן) לחייב אותי בגובה כל עלות כאמור שהוטלה בפועל על TeamPact על ידי מרכז הספורט בשל התנהלותי, כנגד הצגת אסמכתא לחיוב. החיוב יבוצע באמצעות קישור תשלום שיישלח אליי, ולא באופן אוטומטי ללא ידיעתי.',
].map((text, i) => ({ n: i + 1, text }))

/**
 * value: { fullName, idNumber, address, phone, agreed, signatureName }
 * onChange(patch)
 */
export default function CountryClubWaiver({ value, onChange, prefilledName }) {
  const v = value || {}
  function set(patch) { onChange({ ...v, ...patch }) }

  return (
    <div className="space-y-3 border-2 border-amber-300 bg-amber-50 rounded-xl p-4">
      <div>
        <p className="text-sm font-black text-amber-900">📋 הצהרת התחייבות — מרכז הספורט (קאנטרי) חולון</p>
        <p className="text-xs text-amber-800 mt-1">
          החוג פועל בשטח שכור בתוך מרכז הספורט של עיריית חולון. הקאנטרי מחייב כל מתאמן/אורח לחתום על ההתחייבות הבאה לפני ההשתתפות בחוג.
        </p>
      </div>

      <div className="bg-white border border-amber-200 rounded-lg p-3 max-h-56 overflow-y-auto text-xs text-gray-700 space-y-2" tabIndex={0} role="region" aria-label="נוסח ההצהרה">
        {WAIVER_TEXT.map(({ n, text }) => (
          <p key={n}><span className="font-bold">{n}.</span> {text}</p>
        ))}
      </div>

      <Field label="ת&quot;ז" required hint="נדרש לצורך רישום הקאנטרי">
        {(props) => (
          <input {...props} type="text" inputMode="numeric" maxLength={9}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="123456789" value={v.idNumber || ''}
            onChange={e => set({ idNumber: e.target.value.replace(/\D/g, '') })} />
        )}
      </Field>

      <Field label="כתובת מגורים">
        {(props) => (
          <input {...props} type="text"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="רחוב, מספר, עיר" value={v.address || ''}
            onChange={e => set({ address: e.target.value })} />
        )}
      </Field>

      <label className="flex items-start gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!v.agreed}
          onChange={e => set({ agreed: e.target.checked })}
          className="w-4 h-4 mt-0.5 accent-amber-600 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-amber-500"
        />
        <span className="text-xs font-medium text-gray-800">
          קראתי את כל 8 הסעיפים לעיל, אני מסכים/ה להם במלואם, ומאשר/ת את הרשאת החיוב בסעיף 8.
        </span>
      </label>

      <Field label="חתימה — הקלד/י שם מלא כאישור" required hint={prefilledName ? `לדוגמה: ${prefilledName}` : undefined}>
        {(props) => (
          <input {...props} type="text"
            className="w-full border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="שם פרטי ושם משפחה" value={v.signatureName || ''}
            onChange={e => set({ signatureName: e.target.value })} />
        )}
      </Field>
    </div>
  )
}

// ולידציה משותפת — מחזירה הודעת שגיאה או null
export function validateWaiver(v) {
  if (!v?.idNumber || v.idNumber.length < 5) return 'נא למלא מספר ת"ז תקין'
  if (!v?.agreed) return 'יש לאשר את הצהרת ההתחייבות מול הקאנטרי'
  if (!v?.signatureName?.trim()) return 'נא להקליד שם מלא כחתימה'
  return null
}
