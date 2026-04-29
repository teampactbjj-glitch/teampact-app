/**
 * SkipLink - דילוג ניווט לתוכן הראשי
 * תואם WCAG 2.4.1 (Bypass Blocks)
 *
 * הקישור נסתר לעין רגילה אבל מופיע כשמשתמש מקליד Tab.
 * דרוש שיהיה אלמנט עם id="main-content" באפליקציה.
 *
 * שימוש: <SkipLink /> בתחילת ה-render של App.jsx
 */
export default function SkipLink({ targetId = 'main-content' }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[1000] focus:bg-emerald-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:font-bold focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
    >
      דלג לתוכן הראשי
    </a>
  )
}
