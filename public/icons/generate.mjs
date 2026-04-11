// Run: node generate.mjs
// Generates icon-192.png and icon-512.png using Canvas API (Node 18+)
import { createCanvas } from 'canvas'
import { writeFileSync } from 'fs'

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const r = size * 0.12

  // Background
  ctx.fillStyle = '#1e3a5f'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, r)
  ctx.fill()

  // White fist emoji approximation — draw a bold "T" + "P" monogram
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${size * 0.48}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('💪', size / 2, size / 2)

  return canvas.toBuffer('image/png')
}

writeFileSync('icon-192.png', drawIcon(192))
writeFileSync('icon-512.png', drawIcon(512))
console.log('icons generated')
