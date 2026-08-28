import { Resend } from "resend";
import { buildMagazineHtml, type MagazineEmailPayload } from "@/domain/magazine/email-template";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendMagazineEmail(payload: MagazineEmailPayload): Promise<boolean> {
  if (!resend) {
    console.log(`[Email STUB] Send to ${payload.to} (${payload.subscriberName}) | Title: ${payload.magazineTitle}`);
    return true;
  }

  try {
    const fromAddress = process.env.EMAIL_FROM || "CRE Magazine <magazine@credeal.net>";
    const html = buildMagazineHtml(payload);

    const { error } = await resend.emails.send({
      from: fromAddress,
      to: payload.to,
      subject: `[${payload.brokerName}] ${payload.magazineTitle}`,
      html,
    });

    if (error) {
      console.error("[EmailService] Resend error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[EmailService] Unexpected error sending email:", err);
    return false;
  }
}
