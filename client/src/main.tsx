import './polyfills'; // iOS Safari compatibility — MUST be first
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// ── Visible error helper (shows error on screen for iOS Safari debugging) ──
function showFatalError(stage: string, err: unknown) {
  const msg = err instanceof Error
    ? err.message + '\n' + (err.stack || '').substring(0, 400)
    : String(err);
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.innerHTML =
      '<div style="padding:24px;max-width:90vw;font-family:system-ui,-apple-system,sans-serif;">' +
      '<div style="color:#ff6b35;font-size:18px;font-weight:bold;margin-bottom:12px;">⚠️ خطأ: ' + stage + '</div>' +
      '<div style="color:#e8f4f8;font-size:12px;word-break:break-all;white-space:pre-wrap;background:#0d1b2a;padding:12px;border-radius:8px;margin-bottom:8px;">' + msg + '</div>' +
      '<button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#42a5f5;color:#0a1520;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">🔄 إعادة التحميل</button>' +
      '</div>';
    loader.style.opacity = '1';
    loader.style.display = 'flex';
  }
}

let queryClient: QueryClient;
let trpcClient: ReturnType<typeof trpc.createClient>;

try {
  queryClient = new QueryClient();

  const redirectToLoginIfUnauthorized = (error: unknown) => {
    if (!(error instanceof TRPCClientError)) return;
    if (typeof window === "undefined") return;
    const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
    if (!isUnauthorized) return;
    window.location.href = getLoginUrl();
  };

  queryClient.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "error") {
      const error = event.query.state.error;
      redirectToLoginIfUnauthorized(error);
      console.error("[API Query Error]", error);
    }
  });

  queryClient.getMutationCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "error") {
      const error = event.mutation.state.error;
      redirectToLoginIfUnauthorized(error);
      console.error("[API Mutation Error]", error);
    }
  });

  trpcClient = trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch(input, init) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });
} catch (e) {
  showFatalError('إعداد QueryClient/tRPC', e);
  throw e;
}

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error('لم يتم العثور على عنصر #root في الصفحة');

  const root = createRoot(rootEl);
  root.render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );

  // Hide the instant loading screen once React has mounted
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (typeof (window as any).__hideLoader === 'function') {
        (window as any).__hideLoader();
      }
    });
  });
} catch (e) {
  showFatalError('تحميل React', e);
}
