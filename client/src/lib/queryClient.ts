import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
let sessionToken = "";
export function setSessionToken(token: string) { sessionToken = token; }
export function authHeaders() { return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}; }

// "Keep me signed in on this phone" (cleaner logins only). Owner sessions are never saved.
// The server keeps it in an HttpOnly cookie (scripts can't read it) and hands back the token
// only on /api/auth/resume. It can end it any time (password reset, login off).
// Set when a cleaner signs out without signal: the HttpOnly cookie can't be cleared from here,
// so this (non-secret) flag stops the app signing them back in until they sign in on purpose.
const NO_RESUME = "mrcc_no_resume";
const noResume = () => { try { return document.cookie.split("; ").includes(`${NO_RESUME}=1`); } catch { return false; } };
export function setNoResume(on: boolean) {
  try { document.cookie = on ? `${NO_RESUME}=1; max-age=2592000; path=/; SameSite=Strict` : `${NO_RESUME}=; max-age=0; path=/; SameSite=Strict`; } catch { /* cookies off */ }
}
export async function resumeSavedSession(): Promise<string | null> {
  if (noResume()) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/resume`, { credentials: "same-origin", signal: AbortSignal.timeout(8000) });
    if (res.status !== 200) return null;
    const r = await res.json();
    return typeof r.token === "string" ? r.token : null;
  } catch { return null; }
}
/** Ends the session everywhere it's kept. `then` is the sign-in page to land on, e.g. "#/crew" for cleaners. */
export async function signOut(then = "#/") {
  // Confirm the server ended the session; a saved 30-day token must not quietly stay valid.
  let confirmed = false;
  try {
    const res = await fetch(`${API_BASE}/api/logout`, { method: "POST", credentials: "same-origin", headers: authHeaders() as HeadersInit, signal: AbortSignal.timeout(8000) });
    confirmed = res.ok || res.status === 401; // 401: the session was already over
  } catch { /* offline or timed out */ }
  if (!confirmed && !window.confirm("Couldn't reach the office server to finish signing out, so this sign-in may still work for a while. Sign out on this phone anyway? (Press Cancel to try again when you have signal.)")) return false;
  if (!confirmed) setNoResume(true);
  sessionToken = ""; queryClient.clear();
  window.location.hash = then; window.location.reload();
  return confirmed;
}

// Exported so call sites that build URLs outside of apiRequest/getQueryFn
// (e.g. window.open for the printable invoice) still resolve through the
// deployed proxy prefix instead of hitting the static host directly.
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401 && sessionToken) {
      sessionToken = ""; window.dispatchEvent(new Event("workspace-session-expired"));
    }
    const text = (await res.text()) || res.statusText;
    // API errors are JSON `{ message: string }` — surface just the clean
    // message when present instead of the raw "status: {...}" payload, so
    // toasts read naturally (e.g. "Can't delete this customer — ...").
    let cleanMessage: string | null = null;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.message === "string") {
        cleanMessage = parsed.message;
      }
    } catch {
      // not JSON, fall through to the raw format below
    }
    throw new Error(cleanMessage ?? `${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: { ...authHeaders(), ...(data ? { "Content-Type": "application/json" } : {}) } as HeadersInit,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, { headers: authHeaders() as HeadersInit });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
