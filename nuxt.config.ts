import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/test-utils/module',
    '@pinia/nuxt',
    '@prisma/nuxt',
    'shadcn-nuxt',
    'nuxt-auth-utils',
  ],

  vite: {
    plugins: [tailwindcss()],
    // @prisma/nuxt v0.3.0 injects server utils that import from @prisma/client (legacy v6 API).
    // Mark @prisma/client as SSR-external so Vite leaves it as a bare import instead of
    // inlining @prisma/client/default.js (CJS) which cascades into .prisma/client/default.
    ssr: {
      external: ['@prisma/client', '.prisma/client'],
    },
  },

  nitro: {
    // Redirect bare `@prisma/client` imports → a no-op stub so
    // @prisma/nuxt v0.3.0's server utils don't crash at module load time.
    // Only the exact specifier is replaced; @prisma/client/runtime/* subpaths are left alone.
    rollupConfig: {
      plugins: [
        {
          name: 'prisma-client-alias',
          resolveId(id) {
            if (id === '@prisma/client') {
              return fileURLToPath(new URL('./app/generated/prisma-stub.mjs', import.meta.url))
            }
          },
        },
      ],
    },
  },

  css: ['~/assets/css/tailwind.css'],

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  runtimeConfig: {
    sessionPassword: '',         // NUXT_SESSION_PASSWORD
    maxmindLicenseKey: '',       // NUXT_MAXMIND_LICENSE_KEY
    databaseUrl: process.env.DATABASE_URL ?? '', // bridges to Prisma's DATABASE_URL
    public: {},
  },
})
