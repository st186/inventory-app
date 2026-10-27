
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react';
  import tailwindcss from '@tailwindcss/vite';
  import path from 'path';

  export default defineConfig(({ mode }) => ({
    plugins: [react(), tailwindcss()],
    // Production builds strip console.log/debug/info calls (some screens logged whole data
    // arrays on every render) but keep console.warn/error for real problems.
    esbuild: mode === 'production'
      ? { pure: ['console.log', 'console.debug', 'console.info'], drop: ['debugger'] }
      : undefined,
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      // One copy of React however a dependency asks for it (two copies break hooks and add
      // 140 KB).
      dedupe: ['react', 'react-dom'],
      alias: {
        'vaul@1.1.2': 'vaul',
        'sonner@2.0.3': 'sonner',
        'recharts@2.15.2': 'recharts',
        'react-resizable-panels@2.1.7': 'react-resizable-panels',
        'react-hook-form@7.55.0': 'react-hook-form',
        'react-day-picker@8.10.1': 'react-day-picker',
        'next-themes@0.4.6': 'next-themes',
        'lucide-react@0.487.0': 'lucide-react',
        'input-otp@1.4.2': 'input-otp',
        'embla-carousel-react@8.6.0': 'embla-carousel-react',
        'cmdk@1.1.1': 'cmdk',
        'class-variance-authority@0.7.1': 'class-variance-authority',
        '@supabase/supabase-js@2': '@supabase/supabase-js',
        '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
        '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
        '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
        '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
        '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
        '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
        '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
        '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
        '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
        '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
        '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
        '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
        '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
        '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
        '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
        '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
        '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
        '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
        '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
        '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
        '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
        '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
        '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
        '@jsr/supabase__supabase-js@2.49.8': '@jsr/supabase__supabase-js',
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // es2020 rather than esnext: the Android app runs in whatever System WebView the phone
      // has, and an older one can't parse the newest syntax (the whole app would fail to start).
      // CSS stays as it was - lowering it for old browsers would change how colours render.
      target: 'es2020',
      cssTarget: 'esnext',
      outDir: 'dist',
      rollupOptions: {
        output: {
          // Big libraries get chunks of their own, so they stay cached across deploys that only
          // change app code and each loads only with the screens that use it: charts, the
          // spreadsheet reader/writer (exports and settlement uploads), the rider map, and the
          // Supabase client. Rollup pulls a manual chunk's unassigned dependencies into it, so
          // the libraries every screen shares (React, clsx behind every card and badge, the
          // toasts and Capacitor's core) get a 'vendor' chunk - otherwise they'd land in the
          // recharts chunk and every screen would download the charts.
          manualChunks(id) {
            // The re-export list the lazy chart loader imports (components/charts) rides with
            // recharts itself; on its own Rollup could pack unrelated shared code beside it and
            // the home screen would then load the charts through that.
            if (/[\\/]components[\\/]charts[\\/]rechartsParts\.ts$/.test(id)) return 'recharts';
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](recharts|recharts-scale|react-smooth|victory-vendor|d3-[^\\/]+)[\\/]/.test(id)) return 'recharts';
            if (/[\\/]node_modules[\\/]xlsx[\\/]/.test(id)) return 'xlsx';
            if (/[\\/]node_modules[\\/]leaflet[\\/]/.test(id)) return 'leaflet';
            if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase';
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|clsx|sonner|@capacitor[\\/]core)[\\/]/.test(id)) return 'vendor';
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      open: true,
    },
  }));
