import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        { name: 'theme-color', content: '#0f172a' },
      ],
    },
  },

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
    optimizeDeps: {
      include: [
        'class-variance-authority',
        '@vueuse/core',
        'reka-ui',
        'clsx',
        'tailwind-merge',
        'uplot',
        'd3-geo',
        'topojson-client',
      ],
    },
  },

  css: ['~/assets/css/tailwind.css'],

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  // Scan all component subdirectories without prepending the folder name.
  // Default Nuxt behaviour would turn `charts/TopList.vue` into <ChartsTopList>,
  // but our templates reference them by their plain filename (e.g. <TopList>).
  components: [
    { path: '~/components', pathPrefix: false },
  ],

  runtimeConfig: {
    sessionPassword: '',         // NUXT_SESSION_PASSWORD
    maxmindAccountId: '',        // NUXT_MAXMIND_ACCOUNT_ID
    maxmindLicenseKey: '',       // NUXT_MAXMIND_LICENSE_KEY
    databaseUrl: process.env.DATABASE_URL ?? '', // bridges to Prisma's DATABASE_URL
    public: {},
  },

  // Explicitly place serverDir inside app/ so all non-config files live
  // under the same srcDir. Nuxt 4 defaults serverDir to <rootDir>/server;
  // this override keeps the project layout consistent with srcDir = app/.
  serverDir: 'app/server',

  // Prisma 7 uses a WASM-compiled SQLite query engine. Enable WASM support
  // in Nitro so the bundler handles the .wasm binary. Externalize @prisma/client
  // so Rollup doesn't try to bundle it (it contains dynamic requires).
  nitro: {
    experimental: { wasm: true },
    externals: {
      external: ['@prisma/client'],
    },
  },

})
