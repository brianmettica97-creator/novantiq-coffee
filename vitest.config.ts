import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __LAN_ADDRESS__: JSON.stringify('') },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts', 'supabase/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
  },
});
