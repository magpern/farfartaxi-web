// Generates the Farfartaxi icon set from code: `node scripts/gen-icons.mjs`.
// Writes public/icons/farfartaxi.svg + PNGs and public/favicon.svg. PNGs are committed.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const BLUE = '#1d4ed8'

/** White car pictogram on a 512 grid; `hole` is the colour of windows/wheel rings (blue, or black inside a mask). */
function car(hole) {
  return `
  <rect x="226" y="132" width="60" height="26" rx="7" fill="#fff"/>
  <path d="M146 262 L186 178 Q193 164 210 164 L302 164 Q319 164 327 178 L370 262 Z" fill="#fff"/>
  <path d="M176 250 L204 190 L246 190 L246 250 Z M266 190 L302 190 L340 250 L266 250 Z" fill="${hole}"/>
  <rect x="92" y="250" width="328" height="104" rx="30" fill="#fff"/>
  <circle cx="176" cy="356" r="48" fill="${hole}"/><circle cx="176" cy="356" r="32" fill="#fff"/><circle cx="176" cy="356" r="11" fill="${hole}"/>
  <circle cx="336" cy="356" r="48" fill="${hole}"/><circle cx="336" cy="356" r="32" fill="#fff"/><circle cx="336" cy="356" r="11" fill="${hole}"/>`
}

const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${inner}\n</svg>\n`
const centered = (scale, hole) =>
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -262)">${car(hole)}\n  </g>`

const iconSvg = wrap(`<rect width="512" height="512" rx="112" fill="${BLUE}"/>\n  ${centered(1.08, BLUE)}`)
const maskableSvg = wrap(`<rect width="512" height="512" fill="${BLUE}"/>\n  ${centered(0.82, BLUE)}`)
const badgeSvg = wrap(
  `<mask id="m"><rect width="512" height="512" fill="#000"/>${centered(1.3, '#000')}</mask><rect width="512" height="512" fill="#fff" mask="url(#m)"/>`
)

function png(svg, size, file) {
  const out = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: undefined }).render().asPng()
  writeFileSync(join(root, file), out)
}

mkdirSync(join(root, 'icons'), { recursive: true })
writeFileSync(join(root, 'icons/farfartaxi.svg'), iconSvg)
writeFileSync(join(root, 'favicon.svg'), iconSvg)
png(iconSvg, 192, 'icons/icon-192.png')
png(iconSvg, 512, 'icons/icon-512.png')
png(maskableSvg, 512, 'icons/icon-maskable-512.png')
// iOS fills transparency with black, so the touch icon is a full-bleed square.
png(maskableSvg.replace('scale(0.82)', 'scale(1)'), 180, 'icons/apple-touch-icon.png')
png(badgeSvg, 96, 'icons/badge-96.png')
console.log('icons written')
