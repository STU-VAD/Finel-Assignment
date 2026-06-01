import { resolve } from 'path'
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'fs'
import type { Plugin } from 'vite'

/**
 * Vite plugin for fully offline builds.
 * - Downloads Google Fonts to a temp dir during buildStart (dist/ gets cleaned by Vite)
 * - Injects JSON data as <script> globals into index.html via transformIndexHtml
 * - Moves fonts into dist/ and patches CSS in closeBundle (after Vite writes output)
 */
export function offlineData(): Plugin {
  let dataHtml = ''
  let fontCss = ''
  const tmpFontsDir = resolve(__dirname, '.offline-fonts')

  return {
    name: 'offline-data',
    enforce: 'post',

    async buildStart() {
      // Prepare data injection HTML
      const dataDir = resolve(__dirname, 'public/data')
      const combined = readFileSync(resolve(dataDir, 'combined.json'), 'utf-8')
      const temperature = readFileSync(resolve(dataDir, 'temperature.json'), 'utf-8')
      dataHtml = `<script>window.__COMBINED_DATA__=${combined};window.__TEMPERATURE_DATA__=${temperature};</script>`

      // Download Google Fonts to temp dir (dist/ will be cleaned by Vite)
      const agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0'
      const cssUrl = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;600;700&display=swap'
      const resp = await fetch(cssUrl, { headers: { 'User-Agent': agent } })
      const fontsCss = await resp.text()

      mkdirSync(tmpFontsDir, { recursive: true })

      const fontFaces: string[] = []
      const regex = /@font-face\s*\{[^}]*\}/g
      let match: RegExpExecArray | null

      while ((match = regex.exec(fontsCss)) !== null) {
        const block = match[0]
        const weightMatch = block.match(/font-weight:\s*(\d+)/)
        const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)
        if (!weightMatch || !urlMatch) continue

        const weight = weightMatch[1]
        const url = urlMatch[1]
        const fname = url.split('/').pop()!

        try {
          const fontResp = await fetch(url)
          if (!fontResp.ok) continue
          const buffer = Buffer.from(await fontResp.arrayBuffer())
          writeFileSync(resolve(tmpFontsDir, fname), buffer)
          fontFaces.push(
            `@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:${weight};src:url('./fonts/${fname}') format('woff2');font-display:swap;}`
          )
        } catch (e) {
          console.warn(`[offline-data] Font download error: ${fname}`, e)
        }
      }

      fontCss = fontFaces.join('')
      console.log(`[offline-data] Downloaded ${fontFaces.length} font variants`)
    },

    // Inject data <script> into index.html (runs before closeBundle)
    transformIndexHtml(html) {
      return html.replace('</head>', `${dataHtml}\n</head>`)
    },

    // After Vite writes output: move fonts into dist/ and patch CSS
    closeBundle() {
      const dist = resolve(__dirname, 'dist')

      // Move fonts from temp dir to dist/fonts/
      if (fontCss) {
        const destFontsDir = resolve(dist, 'assets', 'fonts')
        mkdirSync(destFontsDir, { recursive: true })
        for (const f of readdirSync(tmpFontsDir)) {
          renameSync(resolve(tmpFontsDir, f), resolve(destFontsDir, f))
        }
        console.log(`[offline-data] Moved fonts to dist/fonts/`)
      }

      // Patch CSS: replace Google Fonts @import with local @font-face
      if (fontCss) {
        const html = readFileSync(resolve(dist, 'index.html'), 'utf-8')
        const linkRegex = /<link[^>]+href="([^"]*\.css)"[^>]*>/g
        let linkMatch: RegExpExecArray | null

        while ((linkMatch = linkRegex.exec(html)) !== null) {
          const cssPath = resolve(dist, linkMatch[1])
          try {
            let css = readFileSync(cssPath, 'utf-8')
            if (css.includes('fonts.googleapis.com')) {
              css = css.replace(
                /@import(?:\s+url\()?["']?https:\/\/fonts\.googleapis\.com[^"')]*["']\)?;?/,
                fontCss
              )
              writeFileSync(cssPath, css)
              console.log(`[offline-data] Patched fonts in ${linkMatch[1]}`)
            }
          } catch { /* skip */ }
        }
      }
      // Patch HTML for file:// protocol compatibility
      const htmlPath = resolve(dist, 'index.html')
      let html = readFileSync(htmlPath, 'utf-8')

      // Remove external module script tags — ES modules always fail on file://
      // even without crossorigin, so removing them eliminates console errors
      html = html.replace(/<script\s+type="module"[^>]*\bsrc="[^"]*"[^>]*><\/script>\n?/g, '')

      // Strip crossorigin from all remaining tags (fixes CSS <link> loading on file://)
      html = html.replace(/ crossorigin/g, '')

      writeFileSync(htmlPath, html)
      console.log(`[offline-data] Patched HTML for file:// compatibility`)
    }
  }
}
