import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // Valores SINTETICOS (nunca secretos reales) para que los modulos que
    // instancian un cliente de Supabase al cargarse (lib/supabase.ts,
    // lib/supabase/client.ts) no arrojen "supabaseUrl is required" al
    // importarse en pruebas -- estas pruebas nunca hacen una llamada de red
    // real: mockean @/lib/supabase directamente o inyectan una funcion falsa
    // en su lugar (ver lib/bancos/__tests__/*.test.ts).
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example-test-project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-synthetic-anon-key-not-a-real-secret',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
