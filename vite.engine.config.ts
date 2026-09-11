import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({plugins:[react()],publicDir:false,build:{outDir:'lib',lib:{entry:'src/engine/index.ts',formats:['es'],fileName:'lecture-engine',cssFileName:'lecture-engine'},rollupOptions:{external:['react','react-dom','react/jsx-runtime']}}})
