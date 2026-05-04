import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/electron/main/index.ts')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/electron/renderer'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/electron/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/electron/renderer'),
        '@': resolve(__dirname, 'src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
