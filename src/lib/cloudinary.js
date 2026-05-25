// Cloudinary config — אחסון תמונות ללא עלות egress
const CLOUD_NAME   = 'ds09n9hlm'
const UPLOAD_PRESET = 'teampact_unsigned' // שנה אם בחרת שם אחר ב-Cloudinary

/**
 * מעלה תמונה ל-Cloudinary ומחזיר את ה-URL הציבורי.
 * לא דורש backend — unsigned preset.
 */
export async function uploadToCloudinary(file) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)
  formData.append('folder', 'teampact')

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Cloudinary error ${res.status}`)
  }

  const data = await res.json()
  return data.secure_url
}
