import { getSaasApiBase } from "./saasBase";

export type PublicSiteConfig = {
  analyticsEnabled: boolean;
  theme: string;
  defaultLanguage: string;
};

export async function fetchPublicCms(): Promise<{ content: Record<string, unknown> }> {
  const base = getSaasApiBase().replace(/\/$/, "");
  const r = await fetch(`${base}/api/public/cms`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<{ content: Record<string, unknown> }>;
}

export async function fetchPublicSiteConfig(): Promise<PublicSiteConfig> {
  const base = getSaasApiBase().replace(/\/$/, "");
  const r = await fetch(`${base}/api/public/site-config`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(await r.text());
  }
  return r.json() as Promise<PublicSiteConfig>;
}
