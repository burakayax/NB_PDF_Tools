import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { sendMail } from "../../lib/mailer.js";
import { createContactEmailTemplate } from "./contact.email.js";
import type { ContactRequestInput } from "./contact.schema.js";

function looksLikeSpam(input: ContactRequestInput) {
  const urlCount = (input.message.match(/https?:\/\//gi) ?? []).length;
  if (urlCount > 2) {
    return true;
  }

  const repeatedCharMatch = input.message.match(/(.)\1{9,}/g);
  if (repeatedCharMatch?.length) {
    return true;
  }

  const normalized = `${input.name} ${input.email} ${input.message}`.toLowerCase();
  const spamPhrases = ["casino", "crypto", "seo service", "backlink", "telegram", "whatsapp group", "viagra", "loan offer"];
  return spamPhrases.some((phrase) => normalized.includes(phrase));
}

export async function submitContactMessage(input: ContactRequestInput) {
  if (looksLikeSpam(input)) {
    throw new HttpError(400, "Your message was flagged by spam protection. Please revise it and try again.");
  }

  const emailTemplate = createContactEmailTemplate({
    name: input.name,
    email: input.email,
    message: input.message,
  });

  try {
    await sendMail({
      to: env.CONTACT_TO_EMAIL,
      replyTo: input.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text,
    });
  } catch {
    throw new HttpError(503, "Mesaj e-posta ile gönderilemedi. Lütfen daha sonra tekrar deneyin.");
  }

  return {
    success: true,
    message: "Mesajınız başarıyla gönderildi.",
  };
}
