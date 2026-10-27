
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
  import { Toaster } from "./components/ui/sonner.tsx";
  // Self-hosted Inter + Noto Sans Bengali/Devanagari (variable). Bengali and Devanagari files
  // download only when that script is on screen; in the APK they ship inside the bundle.
  import "./styles/fonts.css";
  import "./index.css";

  // Mounted once at the root - toast.success()/toast.error() calls throughout the app
  // (QuickAddExpense, SalesManagement, etc.) were firing correctly all along, but with
  // no <Toaster/> anywhere in the tree there was nowhere for them to actually render,
  // so every one of them silently did nothing on screen.
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
      <Toaster position="top-center" richColors />
    </ErrorBoundary>
  );
