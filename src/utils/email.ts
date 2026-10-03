/**
 * Sends the customer a confirmation email after their conversation was escalated,
 * via the Resend API (https://resend.com).
 *
 * Test mode: every email goes to EMAIL_TEST_RECIPIENT instead of the customer's
 * address (the demo's customer addresses are fake). The intended recipient is shown
 * in the email body. If EMAIL_TEST_RECIPIENT or RESEND_API_KEY is not set, nothing
 * is sent - so this can never email a customer address by accident.
 */

export interface EscalationEmailResult {
  sent: boolean;
  intendedFor: string;
  sentTo?: string;
  note: string;
}

const DEFAULT_FROM = "LookinGood Support <onboarding@resend.dev>";

export async function sendEscalationEmail(customerEmail: string, conversationId: string): Promise<EscalationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT;

  if (!apiKey || !testRecipient) {
    console.warn("RESEND_API_KEY or EMAIL_TEST_RECIPIENT not set - skipping confirmation email.");
    return { sent: false, intendedFor: customerEmail, note: "Email not sent (email not configured)." };
  }

  const ref = conversationId.slice(0, 8);
  const text = [
    "Hi,",
    "",
    "Your request has been delivered to the LookinGood support team. We'll update you here when there's an update.",
    "",
    `Reference: ${ref}`,
    "",
    "LookinGood Support",
    "",
    "---",
    `Test mode: this email was meant for ${customerEmail}.`
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [testRecipient],
      subject: `We've received your request (ref ${ref})`,
      text
    })
  });

  if (!response.ok) {
    console.warn(`Confirmation email failed: ${response.status} ${await response.text()}`);
    return { sent: false, intendedFor: customerEmail, sentTo: testRecipient, note: "Email attempt failed." };
  }

  return { sent: true, intendedFor: customerEmail, sentTo: testRecipient, note: "Confirmation email sent." };
}
