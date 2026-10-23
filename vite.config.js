import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Donne au service worker une version propre à chaque build : l'app propose alors la mise à jour
// et l'ancien cache est supprimé.
const versionServiceWorker = () => {
  let dossier
  return {
    name: 'version-service-worker',
    apply: 'build',
    configResolved: (c) => { dossier = resolve(c.root, c.build.outDir) },
    writeBundle: (_, bundle) => {
      const version = createHash('sha256').update(Object.keys(bundle).sort().join()).digest('hex').slice(0, 10)
      const fichier = resolve(dossier, 'sw.js')
      writeFileSync(fichier, readFileSync(fichier, 'utf8').replace("const VERSION = 'dev'", `const VERSION = '${version}'`))
    },
  }
}

export default defineConfig({ plugins: [react(), versionServiceWorker()] })
