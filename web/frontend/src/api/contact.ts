const SAAS_API_BASE = import.meta.env.VITE_SAAS_API_BASE ?? "http://localhost:4000";

export type ContactPayload = {
  name: string;
  email: string;
  message: string;
  website?: string;
};

async function ensureOk(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { message?: string; error?: string };
    throw new Error(payload.message || payload.error || defaultMessage);
  }

  const text = await response.text();
  throw new Error(text || defaultMessage);
}

export async function submitContactForm(payload: ContactPayload) {
  const body = {
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    message: payload.message.trim(),
    website: (payload.website ?? "").trim(),
  };

  const response = await fetch(`${SAAS_API_BASE}/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await ensureOk(response, "Your message could not be sent.");
  return response.json() as Promise<{ success: true; message: string }>;
}
