export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export function isIOSStandalone() {
  if (typeof window === 'undefined') return false
  return window.navigator.standalone === true
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false
  return /Android/.test(navigator.userAgent)
}

export function isStandalone() {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')
  return (mq && mq.matches) || isIOSStandalone()
}
