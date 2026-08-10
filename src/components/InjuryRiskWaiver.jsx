import { Field } from './a11y'
import SignaturePad from './SignaturePad'

// גרסת הנוסח — לשמירה יחד עם כל חתימה (club_waivers.waiver_version), כדי שאם הנוסח
// ישתנה בעתיד יהיה ברור על איזו גרסה בדיוק חתם כל אדם.
export const INJURY_WAIVER_VERSION = 'injury-risk-2026-08'

// נוסח הצהרת הסיכון — כללי לכל הסניפים (לא ספציפי לקאנטרי). מטרתו לתעד הסתכנות
// מרצון מדעת (סעיף 5 לפקודת הנזיקין) + זהירות סבירה מצד האקדמיה. אינו "פטור מוחלט"
// (שלא תקף לפי חוק הגנת הצרכן) — ראו הערה בתקנון (legal/terms-of-service.md, סעיף 7).
// שני נוסחים: מבוגר שחותם על עצמו, והורה/אפוטרופוס שחותם בשם קטין.
function buildText(isMinor) {
  if (isMinor) {
    return [
      'הנני מצהיר/ה כי אני ההורה/האפוטרופוס החוקי של הקטין/ה הנרשם/ת, ומאשר/ת בזאת את השתתפותו/ה באימוני אומנויות לחימה (MMA / ג\'יו-ג\'יטסו / איגרוף תאילנדי, לפי הסניף) באקדמיית TeamPact.',
      'ידוע לי כי האימונים כוללים תרגול פיזי במגע ישיר, בזוגות ו/או בקבוצות, וכי בשל אופי הפעילות קיימת אפשרות ממשית להיפגעות של בני/בתי — לרבות פציעות, נקעים, שברים או חבלות אחרות — גם כאשר האימון מתנהל בפיקוח נאות ובהתאם לכללי הבטיחות.',
      'אני מצהיר/ה כי בני/בתי כשיר/ה מבחינה בריאותית להשתתף בפעילות, ומתחייב/ת לעדכן את האקדמיה בכתב על כל מגבלה רפואית, פציעה קודמת, או מצב בריאותי החורג מהרגיל, מיד עם היוודע הדבר.',
      'ידוע לי כי על בני/בתי (ו/או מי שמלווה אותו/ה) לדווח מידית למאמן/ת או לגורם עזרה ראשונה במקום על כל פגיעה שמתרחשת במהלך האימון, ללא דיחוי.',
      'אני מבין/ה ומקבל/ת כי הסיכון האמור טבעי וכרוך בענף הספורט הנבחר, כי אני מאשר/ת את השתתפות בני/בתי בפעילות מרצון חופשי ומדעת בשמו/ה, ולפיכך פוטר בזאת את האקדמיה מאחריות לנזק שמקורו בסיכון הטבעי האמור — למעט מקרים של רשלנות מוכחת מצד האקדמיה או צוותה.',
      'קראתי, הבנתי, ואני חותם/ת מרצון חופשי ומדעת כאפוטרופוס/ית החוקי/ת של הקטין/ה הנ"ל.',
    ]
  }
  return [
    'הנני מצהיר/ה כי ברצוני להשתתף באימוני אומנויות לחימה (MMA / ג\'יו-ג\'יטסו / איגרוף תאילנדי, לפי הסניף) באקדמיית TeamPact.',
    'ידוע לי כי האימונים כוללים תרגול פיזי במגע ישיר, בזוגות ו/או בקבוצות, וכי בשל אופי הפעילות קיימת אפשרות ממשית להיפגעות — לרבות פציעות, נקעים, שברים או חבלות אחרות — גם כאשר האימון מתנהל בפיקוח נאות ובהתאם לכללי הבטיחות.',
    'אני מצהיר/ה כי אני כשיר/ה מבחינה בריאותית להשתתף בפעילות, ומתחייב/ת לעדכן את האקדמיה בכתב על כל מגבלה רפואית, פציעה קודמת, או מצב בריאותי החורג מהרגיל, מיד עם היוודע הדבר.',
    'ידוע לי כי עליי לדווח מידית למאמן/ת או לגורם עזרה ראשונה במקום על כל פגיעה שמתרחשת במהלך האימון, ללא דיחוי.',
    'אני מבין/ה ומקבל/ת כי הסיכון האמור טבעי וכרוך בענף הספורט הנבחר, כי אני משתתף/ת בפעילות מרצון חופשי ומדעת, ולפיכך פוטר בזאת את האקדמיה מאחריות לנזק שמקורו בסיכון הטבעי האמור — למעט מקרים של רשלנות מוכחת מצד האקדמיה או צוותה.',
    'קראתי, הבנתי, ואני חותם/ת מרצון חופשי ומדעת.',
  ]
}

/**
 * value: { idNumber, signatureName }
 * onChange(patch)
 * isMinor: true → נוסח הורה/אפוטרופוס על קטין, false → נוסח מבוגר על עצמו
 */
export default function InjuryRiskWaiver({ value, onChange, isMinor, prefilledName }) {
  const v = value || {}
  function set(patch) { onChange({ ...v, ...patch }) }
  const text = buildText(isMinor).map((t, i) => ({ n: i + 1, text: t }))

  return (
    <div className="space-y-3 border-2 border-red-300 bg-red-50 rounded-xl p-4">
      <div>
        <p className="text-sm font-black text-red-900">🥊 הצהרת סיכון — אימוני ענף לחימה{isMinor ? ' (הורה/אפוטרופוס לקטין)' : ''}</p>
        <p className="text-xs text-red-800 mt-1">
          ענף הלחימה כרוך במגע פיזי וסיכון טבעי לפציעה. יש לקרוא ולאשר את ההצהרה הבאה לפני תחילת ההשתתפות.
        </p>
      </div>

      <div className="bg-white border border-red-200 rounded-lg p-3 max-h-56 overflow-y-auto text-xs text-gray-700 space-y-2" tabIndex={0} role="region" aria-label="נוסח הצהרת הסיכון">
        {text.map(({ n, text }) => (
          <p key={n}><span className="font-bold">{n}.</span> {text}</p>
        ))}
      </div>

      <Field label="ת&quot;ז" required hint={isMinor ? 'ת״ז ההורה/אפוטרופוס החותם/ת' : undefined}>
        {(props) => (
          <input {...props} type="text" inputMode="numeric" maxLength={9}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="123456789" value={v.idNumber || ''}
            onChange={e => set({ idNumber: e.target.value.replace(/\D/g, '') })} />
        )}
      </Field>

      <label className="flex items-start gap-2 bg-white border border-red-200 rounded-lg px-3 py-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!v.agreed}
          onChange={e => set({ agreed: e.target.checked })}
          className="w-4 h-4 mt-0.5 accent-red-600 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-red-500"
        />
        <span className="text-xs font-medium text-gray-800">
          קראתי את כל {text.length} הסעיפים לעיל, אני מבין/ה את הסיכון הכרוך בענף הלחימה, ומסכים/ה להם במלואם.
        </span>
      </label>

      <div className="space-y-2">
        <span className="text-xs font-semibold text-gray-700 block">
          חתימה <span aria-hidden="true">*</span><span className="sr-only"> (חובה)</span>
        </span>
        <SignaturePad value={v.signatureImage} onChange={img => set({ signatureImage: img })} />
      </div>

      <Field label="שם מלא (חלופה נגישה — אם לא ניתן לצייר חתימה)" hint={prefilledName ? `לדוגמה: ${prefilledName}` : undefined}>
        {(props) => (
          <input {...props} type="text"
            className="w-full border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="שם פרטי ושם משפחה" value={v.signatureName || ''}
            onChange={e => set({ signatureName: e.target.value })} />
        )}
      </Field>
    </div>
  )
}

// ולידציה — מחזירה הודעת שגיאה או null. חתימה = ציור על ה-SignaturePad, או חלופה נגישה
// של שם מוקלד (למי שלא יכול/ה לצייר) — אחד משניהם מספיק.
export function validateInjuryWaiver(v) {
  if (!v?.idNumber || v.idNumber.length < 5) return 'נא למלא מספר ת"ז תקין בהצהרת הסיכון'
  if (!v?.agreed) return 'יש לאשר את הצהרת הסיכון בענף הלחימה'
  if (!v?.signatureImage && !v?.signatureName?.trim()) return 'נא לחתום בהצהרת הסיכון — לצייר חתימה או להקליד שם מלא כחלופה'
  return null
}
