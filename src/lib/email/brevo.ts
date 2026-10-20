// Brevo (brevo.com) transactional email — plain fetch against their REST API
// rather than the SDK, same call-your-own-fetch style as src/lib/rebill/client.ts.
// https://developers.brevo.com/reference/sendtransacemail

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = "support@wmfixandfinish.co.za";
const FROM_NAME = "Wayne's Meter Readings";

export function isEmailConfigured(): boolean {
  return !!process.env.BREVO_API_KEY;
}

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error("Email isn't configured — set BREVO_API_KEY.");
  }

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || `Brevo request failed: ${res.status} ${res.statusText}`);
  }
}
