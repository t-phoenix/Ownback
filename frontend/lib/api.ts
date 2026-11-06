const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001/api";

function csrfHeader(): HeadersInit {
  if (typeof document === "undefined") return {};
  const match = document.cookie.match(/(?:^|; )ob_csrf=([^;]*)/);
  const csrf = match ? decodeURIComponent(match[1]) : "";
  return csrf ? { "x-ob-csrf": csrf } : {};
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: HeadersInit = {
    "content-type": "application/json",
    ...csrfHeader(),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (body as { error?: { code?: string } })?.error?.code || "UPSTREAM";
    throw Object.assign(new Error(code), { code, status: res.status, body });
  }
  return body as T;
}

export type Me = {
  id: string;
  authKind: "privy" | "seed";
  email?: string;
  displayName: string;
  evmAddress?: string;
  solAddress?: string;
  referralCode: string;
  onboarded: boolean;
};

/** Mock-friendly Privy login (MOCK_CHAIN on API derives wallets from accessToken). */
export function authPrivy(accessToken: string) {
  return apiJson<{ user: Me }>("/auth/privy", {
    method: "POST",
    body: JSON.stringify({ accessToken }),
  });
}
