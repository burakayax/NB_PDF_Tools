/** http(s) URL ve hostname localhost / 127.0.0.1 mi (herhangi bir port). */
export function envHttpUrlIsLoopback(value: string): boolean {
  try {
    const u = new URL(value);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Tarayıcıda sayfa localhost dışında açıksa (ör. üretim domain’i); SSR’da false. */
export function isNonLocalDeployedHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const h = window.location.hostname;
  return h !== "localhost" && h !== "127.0.0.1";
}
