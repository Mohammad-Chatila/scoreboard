// Netlify build step. If SUPABASE_URL + SUPABASE_ANON_KEY are set as
// environment variables, write config.js from them. Otherwise leave the
// committed config.js alone so GitHub Pages / local dev keep working.
import { writeFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  writeFileSync(
    new URL('../config.js', import.meta.url),
    `// generated at build time from environment variables — do not edit\n` +
    `export const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};\n` +
    `export const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};\n`
  );
  console.log('✓ config.js generated from environment variables');
} else {
  console.log('· no SUPABASE_* env vars set — using the committed config.js');
}
