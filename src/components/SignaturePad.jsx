import { useRef, useEffect } from 'react'

/**
 * חתימה בכתב-יד דיגיטלי — ציור חופשי על canvas (אצבע במובייל, עכבר/טראצפד בדסקטופ).
 * value: data URL של PNG (או '' אם ריק) — נשלט מבחוץ רק לצורך "יש/אין חתימה", לא נטען מחדש לקנבס.
 * onChange(dataUrl)
 */
export default function SignaturePad({ value, onChange, height = 140 }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const hasStrokeRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, rect.width * dpr)
    canvas.height = Math.max(1, rect.height * dpr)
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2937'
  }, [])

  function posFromEvent(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = e.touches?.[0] || e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function start(e) {
    e.preventDefault()
    drawingRef.current = true
    hasStrokeRef.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = posFromEvent(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function move(e) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = posFromEvent(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function end() {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (hasStrokeRef.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    hasStrokeRef.current = false
    onChange('')
  }

  return (
    <div className="space-y-1.5">
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={value ? 'חתימה מצוירת קיימת' : 'אזור לציור חתימה — ריק'}
          style={{ width: '100%', height, display: 'block' }}
          className="cursor-crosshair"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {!value && (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
            ✍️ חתמו כאן — באצבע במובייל או בעכבר
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={clear}
          className="text-xs text-gray-500 hover:text-red-600 font-medium focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-red-400 rounded">
          🗑️ נקה וחתום מחדש
        </button>
      </div>
    </div>
  )
}
