// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
        keep_fnames: true,        // ✅ Keep function names
        keep_classnames: true     // ✅ Keep class names
      },
      mangle: {
        keep_fnames: true,        // ✅ Keep function names
        keep_classnames: true     // ✅ Keep class names
      }
    }
  }
})