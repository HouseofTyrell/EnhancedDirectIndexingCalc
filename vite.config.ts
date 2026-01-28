import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // Use repo name for GitHub Pages, relative path for local/other hosting
  base: process.env.GITHUB_ACTIONS ? '/EnhancedDirectIndexingCalc/' : './',
});
