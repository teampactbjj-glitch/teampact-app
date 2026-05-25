import { useId } from 'react'

/**
 * Field נגיש - מקשר label ל-input אוטומטית, תומך ב-error ו-hint
 * תואם WCAG 1.3.1, 3.3.2, 4.1.2
 *
 * שימוש:
 * <Field label="שם מלא" required error={errors.name} hint="שם פרטי + משפחה">
 *   {(props) => (
 *     <input {...props} type="text" value={name} onChange={e => setName(e.target.value)}
 *       className="w-full border rounded-lg px-3 py-2" />
 *   )}
 * </Field>
 *
 * ה-children מקבל אובייקט props שכולל:
 * - id, aria-invalid, aria-describedby, aria-required, required
 * צריך לפזר אותו על ה-input.
 */
export default function Field({ label, error, required, children, hint, className = '' }) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined

  const inputProps = {
    id,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
    'aria-required': required ? 'true' : undefined,
    required: required || undefined,
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-semibold text-gray-700 block mb-1">
        {label}
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> (חובה)</span>
          </>
        )}
      </label>
      {children(inputProps)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-gray-500 mt-1">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600 mt-1 font-medium">
          {error}
        </p>
      )}
    </div>
  )
}
