import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

import { queryClient } from "./api/client";
import { startOutbox } from "./lib/outbox";
// feature:help.feedback:start
import { startErrorLog } from "./lib/errorLog";
// feature:help.feedback:end
import { startStaleBuildRecovery } from "./lib/staleBuild";
import { persistOptions } from "./lib/persistence";
import { router } from "./routes";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ThemeProvider } from "./components/theme-provider";
import "./styles.css";

// Changes made offline are sent as soon as the connection returns.
startOutbox();
// feature:help.feedback:start
// Recent errors, for bug reports (Help & feedback).
startErrorLog();
// feature:help.feedback:end

// A tab still on an old build after a deploy reloads itself once (chunks the
// server no longer has), instead of showing a broken page.
startStaleBuildRecovery();

// A new version is offered, not swapped in under a page in use: swapping the
// files mid-session is what strands a tab on chunks that have gone.
const updateApp = registerSW({
  onNeedRefresh() {
    toast("A new version is ready", {
      id: "app-update",
      duration: Infinity,
      action: { label: "Reload", onClick: () => void updateApp(true) },
    });
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");

createRoot(root).render(
  <StrictMode>
    {/* Last resort: a render error outside any route (providers, the shell)
        shows a recoverable page rather than a blank screen. */}
    <AppErrorBoundary>
      <ThemeProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <RouterProvider router={router} />
        </PersistQueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

