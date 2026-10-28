  import { Suspense, lazy } from "react";
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
  import { Toaster } from "./components/ui/sonner.tsx";
  // Self-hosted Inter + Noto Sans Bengali/Devanagari (variable). Bengali and Devanagari files
  // download only when that script is on screen; in the APK they ship inside the bundle.
  import "./styles/fonts.css";
  import "./index.css";
  import { startLiveUpdates } from "./utils/liveUpdate";
  import { startTheme } from "./utils/appTheme";

  // Light or dark, as chosen on this phone (utils/appTheme.ts), before anything is drawn.
  startTheme();

  // Android app: confirm this version started, then look for an update (utils/liveUpdate.ts).
  startLiveUpdates();

  // The host for confirm() / promptText() (components/ui/confirm.tsx), mounted once. Loaded just
  // after the first frame - the dialog code isn't needed to start - and if a confirm is asked for
  // before it arrives, confirm.tsx mounts a host by itself.
  const ConfirmProvider = lazy(() => import("./components/ui/confirm.tsx").then((m) => ({ default: m.ConfirmProvider })));

  // Toasts sit bottom-centre above the bottom nav (the placement is part of the design, so no
  // position / richColors here).
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
      <Toaster />
      <Suspense fallback={null}>
        <ConfirmProvider />
      </Suspense>
    </ErrorBoundary>
  );
