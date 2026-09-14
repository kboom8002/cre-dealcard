import { Resend } from "resend";
import { buildMagazineHtml, type MagazineEmailPayload } from "@/domain/magazine/email-template";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("email-service");

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function sendMagazineEmail(payload: MagazineEmailPayload): Promise<boolean> {
  if (!resend) {
    log.info(`[Email STUB] Send to ${payload.to} (${payload.subscriberName})`, {
      title: payload.magazineTitle,
      to: payload.to,
    });
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
      log.error("Resend error sending magazine email", error, { to: payload.to });
      return false;
    }

    return true;
  } catch (err) {
    log.error("Unexpected error sending email", err, { to: payload.to });
    return false;
  }
}

