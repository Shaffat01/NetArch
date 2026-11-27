import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || `http://127.0.0.1:${env.BACKEND_PORT || '8000'}`
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: parseInt(env.FRONTEND_PORT || '8090'),
      allowedHosts: true,
      cors: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: parseInt(env.FRONTEND_PORT || '4173'),
      allowedHosts: true,
      cors: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
