/**
 * דף הצהרת נגישות — נגיש בעצמו (WCAG 2.1 AA / ת"י 5568).
 * זמין ללא login תחת `/accessibility`.
 * חובה לפי תקנות נגישות לשירות (התשע"ג-2013) שתופיע באתר ובאפליקציה.
 */
export default function AccessibilityPage() {
  return (
    <main id="main-content" dir="rtl" className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-5 py-8 sm:py-10">
        {/* Header */}
        <header className="mb-8 pb-5 border-b border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            הצהרת נגישות
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            מועדון Team Pact – אפליקציה לניהול אימוני אומנויות לחימה
          </p>
        </header>

        {/* Intro */}
        <section className="mb-8">
          <p className="text-base leading-relaxed text-gray-800">
            מועדון <strong>Team Pact</strong> רואה חשיבות עליונה במתן שירות שווה
            ונגיש לכלל הציבור, לרבות אנשים עם מוגבלות. אנו פועלים להנגיש את
            האפליקציה ואת השירותים הדיגיטליים שלנו בהתאם להוראות חוק שוויון
            זכויות לאנשים עם מוגבלות, התשנ"ח-1998, ולתקנות הנגישות לשירות,
            התשע"ג-2013.
          </p>
        </section>

        {/* סטטוס */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            סטטוס הנגישות באפליקציה
          </h2>
          <p className="text-base leading-relaxed text-gray-800 mb-3">
            האפליקציה הונגשה לרמת <strong>AA</strong> של תקן ישראלי{' '}
            <strong>ת"י 5568</strong> (המבוסס על תקן בינלאומי{' '}
            <abbr title="Web Content Accessibility Guidelines 2.1">WCAG 2.1</abbr>
            ).
          </p>
          <p className="text-base text-gray-800 mb-2">ההנגשה כוללת בין השאר:</p>
          <ul className="list-disc pr-6 space-y-1.5 text-base text-gray-800">
            <li>ניווט מלא במקלדת ללא צורך בעכבר.</li>
            <li>תמיכה בקוראי מסך (NVDA, JAWS, VoiceOver).</li>
            <li>ניגודיות צבעים מתאימה לתקן.</li>
            <li>אפשרות הגדלת טקסט עד 200% ללא שבירת פריסה.</li>
            <li>תיוג סמנטי של כותרות, טפסים, תפריטים וכפתורים.</li>
            <li>טקסט חלופי (alt) לכל התמונות התוכנייות.</li>
            <li>
              הודעות מערכת ושגיאה זמינות לקוראי מסך באמצעות תיוג{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">aria-live</code>.
            </li>
            <li>חלונות דיאלוג עם <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">role=&quot;dialog&quot;</code>, focus trap וסגירה במקש Escape.</li>
            <li>תמיכה מלאה בכיוון RTL לעברית.</li>
          </ul>
        </section>

        {/* חריגי נגישות */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">חריגי נגישות</h2>
          <p className="text-base leading-relaxed text-gray-800">
            על אף מאמצינו, ייתכן ובחלק מהדפים תיתקלו בליקויים נקודתיים. אנו
            פועלים לתיקון ליקויים אלו בהקדם. אם נתקלתם בליקוי – אנא פנו אלינו
            דרך פרטי הקשר בהמשך הדף.
          </p>
        </section>

        {/* פניות */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            בקשות, הצעות ופניות בנושאי נגישות
          </h2>
          <p className="text-base leading-relaxed text-gray-800 mb-4">
            אם נתקלתם בבעיית נגישות באפליקציה, או יש לכם הצעות לשיפור – נשמח
            לשמוע מכם. אנו מתחייבים להגיב לפנייה תוך <strong>14 ימי עסקים</strong>.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2">
            <h3 className="font-bold text-gray-900 mb-2">
              רכז הנגישות במועדון Team Pact
            </h3>
            <dl className="text-base text-gray-800 space-y-1.5">
              <div className="flex flex-wrap gap-2">
                <dt className="font-semibold min-w-[80px]">שם:</dt>
                <dd>דודי בן זקן</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="font-semibold min-w-[80px]">תפקיד:</dt>
                <dd>ראש המועדון / בעל העסק</dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="font-semibold min-w-[80px]">דוא"ל:</dt>
                <dd>
                  <a
                    href="mailto:teampactbjj@gmail.com"
                    className="text-blue-700 underline hover:text-blue-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700 rounded"
                  >
                    teampactbjj@gmail.com
                  </a>
                </dd>
              </div>
              <div className="flex flex-wrap gap-2">
                <dt className="font-semibold min-w-[80px]">שעות מענה:</dt>
                <dd>ימים א'–ה' (לא כולל שישי, שבת וחגי ישראל)</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* תאריכים */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">תאריכים</h2>
          <dl className="text-base text-gray-800 space-y-1.5">
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold min-w-[200px]">
                תאריך הצהרת הנגישות הנוכחית:
              </dt>
              <dd>29.04.2026</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold min-w-[200px]">תאריך עדכון אחרון:</dt>
              <dd>29.04.2026</dd>
            </div>
            <div className="flex flex-wrap gap-2">
              <dt className="font-semibold min-w-[200px]">בוצע ע"י:</dt>
              <dd>צוות הפיתוח של Team Pact</dd>
            </div>
          </dl>
        </section>

        {/* הסעדים */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">הסעדים על פי דין</h2>
          <p className="text-base leading-relaxed text-gray-800">
            ככל שתסברו כי על אף מאמצינו לא הונגש פרט במידה מספקת, באפשרותכם
            לפנות לנציבות שוויון זכויות לאנשים עם מוגבלות במשרד המשפטים, באמצעות{' '}
            <a
              href="https://www.gov.il/he/Departments/equal_rights_for_people_with_disabilities"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 underline hover:text-blue-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700 rounded"
            >
              אתר הנציבות
            </a>{' '}
            או בטלפון{' '}
            <a
              href="tel:026549556"
              className="text-blue-700 underline hover:text-blue-900 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700 rounded"
            >
              02-6549556
            </a>
            .
          </p>
        </section>

        {/* חזרה */}
        <div className="pt-6 border-t border-gray-200">
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-700"
          >
            <span aria-hidden="true">→</span>
            חזרה לאפליקציה
          </a>
        </div>
      </div>
    </main>
  )
}
