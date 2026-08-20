/**
 * The transport, against a stubbed provider. No credential in this file is
 * real, and no test here reaches the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailDeliveryError, IDEMPOTENCY_HEADER, parseFromAddress, resendAdapter } from "./resend";

const CONFIG = { apiKey: "re_test_not_a_real_key", from: "Courvia <hola@courvia.test>" };

function adapter() {
  return resendAdapter(CONFIG)({ payload: {} as never });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseFromAddress", () => {
  it("splits a display name from an address", () => {
    expect(parseFromAddress("Courvia <hola@courvia.test>")).toEqual({
      name: "Courvia",
      address: "hola@courvia.test",
    });
  });

  it("accepts a bare address", () => {
    expect(parseFromAddress("hola@courvia.test")).toEqual({ name: "", address: "hola@courvia.test" });
  });
});

describe("sending", () => {
  it("posts the message to Resend with the configured sender", async () => {
    const fetchMock = stubFetch(Response.json({ id: "msg_1" }));
    await adapter().sendEmail({
      to: "ana@example.test",
      subject: "Asunto",
      text: "cuerpo",
      html: "<p>cuerpo</p>",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.resend.com/emails");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CONFIG.apiKey}`);
    expect(requestBody(fetchMock)).toMatchObject({
      from: CONFIG.from,
      to: ["ana@example.test"],
      subject: "Asunto",
      text: "cuerpo",
      html: "<p>cuerpo</p>",
    });
  });

  it("forwards an idempotency key, which is what stops a retry mailing twice", async () => {
    const fetchMock = stubFetch(Response.json({ id: "msg_2" }));
    await adapter().sendEmail({
      to: "ana@example.test",
      subject: "Asunto",
      text: "cuerpo",
      headers: { [IDEMPOTENCY_HEADER]: "outbox-42" },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)[IDEMPOTENCY_HEADER]).toBe("outbox-42");
  });

  it("omits the header when there is no key rather than inventing one", async () => {
    const fetchMock = stubFetch(Response.json({ id: "msg_3" }));
    await adapter().sendEmail({ to: "ana@example.test", subject: "x", text: "y" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(Object.keys(init.headers as Record<string, string>)).not.toContain(IDEMPOTENCY_HEADER);
  });

  it("flattens the address shapes nodemailer allows", async () => {
    const fetchMock = stubFetch(Response.json({ id: "msg_4" }));
    await adapter().sendEmail({
      to: [{ name: "Ana", address: "ana@example.test" }, "bea@example.test"],
      subject: "x",
      text: "y",
    });
    expect(requestBody(fetchMock).to).toEqual(["Ana <ana@example.test>", "bea@example.test"]);
  });

  it("throws with the provider's status, and never with the credential", async () => {
    stubFetch(Response.json({ message: "The courvia.test domain is not verified" }, { status: 403 }));
    const error = await adapter()
      .sendEmail({ to: "ana@example.test", subject: "x", text: "y" })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect((error as EmailDeliveryError).status).toBe(403);
    expect((error as Error).message).toContain("not verified");
    // A stack trace or an outbox `lastError` column is not a place for a key.
    expect((error as Error).message).not.toContain(CONFIG.apiKey);
  });
});
