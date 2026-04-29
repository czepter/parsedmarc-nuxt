import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/test-utils/module',
    '@pinia/nuxt',
    'shadcn-nuxt',
    'nuxt-auth-utils',
  ],

  vite: {
    plugins: [tailwindcss()],
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
