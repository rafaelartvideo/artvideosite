import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        return path.resolve(__dirname, 'src/assets', id.replace('figma:asset/', ''))
      }
    },
  }
}

export default defineConfig({
  plugins: [figmaAssetResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@/features/access/presentation/UserAccessSection': path.resolve(__dirname, 'src/features/access/presentation/UserAccessSectionV2.tsx'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@tanstack/react-query') || id.includes('@tanstack/query-core')) return 'vendor-query'
        },
      },
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
