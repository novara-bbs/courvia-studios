/**
 * The panel's reset email.
 *
 * Until this task Payload accepted "forgot my password", wrote a token and
 * sent nothing, because no email adapter existed. The adapter fixes the
 * delivery; these assertions cover the message — including the two things a
 * reset email gets wrong most often: a link that goes nowhere, and a stated
 * expiry that does not match the token's.
 */
import { describe, expect, it } from "vitest";
import type { CollectionConfig } from "payload";

import {
  PASSWORD_RESET_EXPIRATION_MINUTES,
  passwordResetHtml,
  passwordResetSubject,
  withAdminPasswordReset,
} from "./admin-password-reset";

const ARGS = {
  req: { payload: { config: { routes: { admin: "/admin" } } } },
  token: "a-token",
  user: { name: "Vicente", email: "admin@courvia.test" },
};

describe("the reset email", () => {
  it("is in the language the panel is written in", () => {
    expect(passwordResetSubject()).toBe("Restablecer tu contraseña del panel");
    expect(passwordResetHtml(ARGS)).toContain("Hola, Vicente.");
    expect(passwordResetHtml(ARGS)).toContain("admin@courvia.test");
  });

  it("links the panel's own reset form, at whatever route the config gives it", () => {
    expect(passwordResetHtml(ARGS)).toContain("/admin/reset/a-token");
    const moved = { ...ARGS, req: { payload: { config: { routes: { admin: "/panel" } } } } };
    expect(passwordResetHtml(moved)).toContain("/panel/reset/a-token");
  });

  it("states the expiry the token actually has", () => {
    const collection = withAdminPasswordReset({ slug: "users", auth: true, fields: [] });
    const auth = collection.auth as { forgotPassword?: { expiration?: number } };
    expect(auth.forgotPassword?.expiration).toBe(PASSWORD_RESET_EXPIRATION_MINUTES * 60_000);
    expect(passwordResetHtml(ARGS)).toContain(`${PASSWORD_RESET_EXPIRATION_MINUTES} minutos`);
  });

  it("tells somebody who did not ask that nothing has happened", () => {
    // The reason this line matters: a reset email is also what a victim of a
    // targeted attempt sees first, and the useful information is "your
    // password still works".
    expect(passwordResetHtml(ARGS)).toContain("La contraseña actual sigue siendo válida");
  });

  it("keeps everything else about the collection untouched", () => {
    const users: CollectionConfig = {
      slug: "users",
      auth: true,
      access: { read: () => true },
      fields: [{ name: "name", type: "text" }],
    };
    const wrapped = withAdminPasswordReset(users);
    expect(wrapped.slug).toBe("users");
    expect(wrapped.fields).toBe(users.fields);
    expect(wrapped.access).toBe(users.access);
  });

  it("survives Payload calling it with nothing", () => {
    // The generator's arguments are all optional in Payload's own types.
    expect(() => passwordResetHtml()).not.toThrow();
  });
});
