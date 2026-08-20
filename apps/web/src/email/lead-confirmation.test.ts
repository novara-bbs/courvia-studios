/**
 * The email a waitlist signup gets — content and safety.
 *
 * Two different jobs in one file on purpose. The escaping assertions are
 * security: a lead's name is attacker-controlled text that we render into
 * HTML and mail to somebody else. The voice assertions are the other half of
 * `.claude/rules/content-voice.md`, which says what "does not look
 * AI-generated" means concretely — and a rule with no test is a preference.
 */
import { LOCALES } from "@courvia/platform";
import { describe, expect, it } from "vitest";

import { leadConfirmationEmail } from "./lead-confirmation";

const BASE = {
  name: "Ana",
  locale: "es" as const,
  region: "es" as const,
  intent: "waitlist" as const,
  variantSku: null,
  origin: "https://courvia.test",
};

describe("the lead confirmation", () => {
  it("says what was asked for, in the lead's language", () => {
    const es = leadConfirmationEmail(BASE);
    expect(es.subject).toBe("Tu solicitud está registrada");
    expect(es.text).toContain("Hola, Ana.");
    expect(es.text).toContain("un sitio en la lista de espera");

    const en = leadConfirmationEmail({ ...BASE, locale: "en", region: "en-gb", intent: "demo" });
    expect(en.subject).toBe("Your request is logged");
    expect(en.text).toContain("a demo");
  });

  it("renders in every locale the platform declares", () => {
    // A locale added to @courvia/platform without its email copy would
    // otherwise be discovered by a lead, in their inbox, in Spanish.
    for (const locale of LOCALES) {
      const message = leadConfirmationEmail({ ...BASE, locale });
      expect(message.subject).not.toBe("");
      expect(message.text).not.toContain("lead.");
    }
  });

  it("carries the direction and language of its locale", () => {
    expect(leadConfirmationEmail({ ...BASE, locale: "ar", region: "ar-ae" }).html).toContain(
      '<html lang="ar" dir="rtl">',
    );
    expect(leadConfirmationEmail(BASE).html).toContain('<html lang="es" dir="ltr">');
  });

  it("links the privacy page of the region the lead came from", () => {
    expect(leadConfirmationEmail({ ...BASE, region: "en-ae" }).text).toContain(
      "https://courvia.test/en-ae/privacidad",
    );
  });

  it("mentions the configuration only when one was ticked", () => {
    expect(leadConfirmationEmail(BASE).text).not.toContain("Configuración que marcaste");
    expect(leadConfirmationEmail({ ...BASE, variantSku: "TMP-R1-P" }).text).toContain(
      "Configuración que marcaste: TMP-R1-P.",
    );
  });

  it("escapes what the visitor typed", () => {
    const message = leadConfirmationEmail({
      ...BASE,
      name: '<img src=x onerror="alert(1)">',
    });
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    // The plain-text part is not markup and must keep what was typed.
    expect(message.text).toContain('<img src=x onerror="alert(1)">');
  });

  it("sends a plain-text part alongside the HTML", () => {
    const message = leadConfirmationEmail(BASE);
    expect(message.text).not.toContain("<");
    expect(message.html).toContain("<!doctype html>");
  });

  it("sounds like Courvia and not like a generated newsletter", () => {
    for (const locale of LOCALES) {
      const body = leadConfirmationEmail({ ...BASE, locale }).text;
      // content-voice.md, the banned tics: no emoji, no piled-up
      // exclamations, no "Descubre"/"Discover" opener.
      expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(body).not.toContain("!");
      expect(body).not.toContain("¡");
      expect(body.toLowerCase()).not.toMatch(/descubre|discover|bienvenido|welcome to/);
    }
  });

  it("does not promise more than the thank-you page does", () => {
    // /gracias says a person replies within one working day. An
    // autoresponder that implies it IS that reply contradicts the site.
    expect(leadConfirmationEmail(BASE).text).toContain("Este correo solo confirma que llegó");
  });
});
