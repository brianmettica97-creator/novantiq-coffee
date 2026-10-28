import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'node:os'
import { defineConfig } from 'vite'

// IP de la red local: permite que el QR de la demo abra la carta desde un
// celular conectado al mismo Wi-Fi durante el desarrollo.
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) return net.address
    }
  }
  return ''
}

export default defineConfig({
  // En GitHub Pages la app vive en /<repo>/ (lo define el workflow de publicación).
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  define: {
    __LAN_ADDRESS__: JSON.stringify(lanAddress()),
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
