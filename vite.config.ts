import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

// Lacuna is a static, serverless single-page application.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
