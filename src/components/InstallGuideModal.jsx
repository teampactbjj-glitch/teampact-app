import { useState } from 'react'
import Modal from './a11y/Modal'

/**
 * InstallGuideModal — מדריך התקנת PWA לספארי ולכרום
 * props:
 *   open   : boolean
 *   onClose: () => void
 */
export default function InstallGuideModal({ open, onClose }) {
  const [tab, setTab] = useState('safari') // 'safari' | 'chrome'

  const safariSteps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-600" aria-hidden>
          <path d="M12 3l4 4-1.4 1.4L13 6.8V16h-2V6.8L9.4 8.4 8 7l4-4zm-7 13h2v3h10v-3h2v5H5v-5z" />
        </svg>
      ),
      label: 'לחץ על כפתור השיתוף',
      sub: 'סרגל תחתון של Safari — האייקון עם החץ למעלה',
    },
    {
      icon: <span className="text-lg">⌄</span>,
      label: 'גלול למטה ולחץ "הצגת עוד"',
      sub: 'הסמל עם חץ למטה בתחתית רשימת האפשרויות',
    },
    {
      icon: <span className="text-lg">➕</span>,
      label: 'בחר "הוסף למסך הבית"',
      sub: 'הפריט מופיע ברשימה המורחבת',
    },
    {
      icon: <span className="text-lg">✅</span>,
      label: 'לחץ "הוסף" בפינה העליונה הימנית',
      sub: 'האפליקציה תופיע כאייקון על מסך הבית שלך',
    },
    {
      icon: <span className="text-lg">🔔</span>,
      label: 'פתח את TeamPact מהאייקון',
      sub: 'הרשה התראות כשתתבקש — זהו!',
    },
  ]

  const chromeSteps = [
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-600" aria-hidden>
          <path d="M12 3l4 4-1.4 1.4L13 6.8V16h-2V6.8L9.4 8.4 8 7l4-4zm-7 13h2v3h10v-3h2v5H5v-5z" />
        </svg>
      ),
      label: 'לחץ על כפתור השיתוף',
      sub: 'פינה שמאלית עליונה של Chrome באייפון',
    },
    {
      icon: <span className="text-lg">⌄</span>,
      label: 'לחץ "הצגת עוד"',
      sub: 'הסמל עם חץ למטה בתחתית תפריט השיתוף',
    },
    {
      icon: <span className="text-lg">➕</span>,
      label: 'בחר "הוסף למסך הבית"',
      sub: 'הפריט מופיע ברשימה המורחבת',
    },
    {
      icon: <span className="text-lg">✅</span>,
      label: 'לחץ "הוסף" בחלון האישור',
      sub: 'האפליקציה תתווסף למסך הבית של המכשיר',
    },
    {
      icon: <span className="text-lg">🔔</span>,
      label: 'פתח את TeamPact מהאייקון',
      sub: 'הרשה התראות כשתתבקש — זהו!',
    },
  ]

  const steps = tab === 'safari' ? safariSteps : chromeSteps

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="כיצד להוסיף למסך הבית?"
      maxWidth="max-w-sm"
      actions={
        <button
          type="button"
          onClick={onClose}
          className="bg-blue-600 text-white text-sm font-bold px-5 py-2 rounded-lg hover:bg-blue-700"
        >
          הבנתי
        </button>
      }
    >
      {/* טאבים */}
      <div className="flex gap-2 mb-5" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'safari'}
          onClick={() => setTab('safari')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
            tab === 'safari'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
          }`}
        >
          🧭 Safari (iPhone)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chrome'}
          onClick={() => setTab('chrome')}
          className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
            tab === 'chrome'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
          }`}
        >
          🌐 Chrome (iPhone)
        </button>
      </div>

      {/* שלבים */}
      <ol className="space-y-3" role="tabpanel">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            {/* מספר שלב */}
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center mt-0.5">
              {i + 1}
            </span>
            {/* אייקון */}
            <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
              {step.icon}
            </span>
            {/* טקסט */}
            <div>
              <p className="font-semibold text-gray-800 text-sm leading-snug">{step.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{step.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* הערה תחתית */}
      <p className="mt-5 text-xs text-gray-400 text-center border-t pt-3">
        לאחר ההתקנה תקבל עדכונים ואת כל תכונות האפליקציה
      </p>
    </Modal>
  )
}
