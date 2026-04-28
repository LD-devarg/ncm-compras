import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Si desplegás en GitHub Pages como proyecto (no organización),
// cambiá '/compras_ncm/' por el nombre exacto de tu repositorio.
export default defineConfig({
  plugins: [react()],
  base: '/compras_ncm/',
})
