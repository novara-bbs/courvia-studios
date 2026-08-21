import { describe, expect, it } from "vitest";

import {
  CommerceOwnerMismatchError,
  assertOwnsRef,
  ownerKey,
  ownsRef,
  refKey,
  sameConnection,
  sameOwner,
} from "./engine";
import type { CommerceOwner, OrderRef, VariantRef } from "./engine";

const OWNER: CommerceOwner<"native"> = {
  siteKey: "courvia",
  engine: "native",
  connectionKey: "native-es",
  bindingRevision: 2,
};

const OWN_VARIANT: VariantRef<"native"> = {
  kind: "variant",
  engine: "native",
  connectionKey: "native-es",
  externalId: "var_1",
};

const SIBLING_ORDER: OrderRef<"native"> = {
  kind: "order",
  engine: "native",
  connectionKey: "native-uk",
  externalId: "order_1",
};

const HOSTED_ORDER: OrderRef<"shopify"> = {
  kind: "order",
  engine: "shopify",
  connectionKey: "shop-eu",
  externalId: "gid://shopify/Order/1",
};

describe("sameConnection", () => {
  it("compara motor y conexión, y NO la revisión", () => {
    // Es la regla que hace ciertos los invariantes 6 y 17: cambiar la
    // conexión activa sube la revisión y los carritos y pedidos que ya
    // existen tienen que seguir operándose.
    const bumped: CommerceOwner<"native"> = { ...OWNER, bindingRevision: 9 };
    expect(sameConnection(OWNER, bumped)).toBe(true);
    expect(sameOwner(OWNER, bumped)).toBe(false);
    expect(sameConnection(OWNER, SIBLING_ORDER)).toBe(false);
    expect(sameConnection(OWNER, HOSTED_ORDER)).toBe(false);
  });
});

describe("ownsRef / assertOwnsRef", () => {
  it("acepta lo propio", () => {
    expect(ownsRef(OWNER, OWN_VARIANT)).toBe(true);
    expect(() => {
      assertOwnsRef(OWNER, OWN_VARIANT);
    }).not.toThrow();
  });

  it("distingue el motor de la conexión al rechazar", () => {
    // Dos violaciones distintas: una tienda del mismo tipo no es lo mismo que
    // el otro motor, y quien lo registre debe poder contarlas por separado.
    expect(() => {
      assertOwnsRef(OWNER, HOSTED_ORDER);
    }).toThrow(CommerceOwnerMismatchError);
    expect(() => {
      assertOwnsRef(OWNER, SIBLING_ORDER);
    }).toThrow(CommerceOwnerMismatchError);

    try {
      assertOwnsRef(OWNER, SIBLING_ORDER);
      expect.unreachable("una referencia de otra conexión no puede pasar");
    } catch (error) {
      expect(error).toBeInstanceOf(CommerceOwnerMismatchError);
      expect((error as CommerceOwnerMismatchError).violation).toBe("connection_mismatch");
    }

    try {
      assertOwnsRef(OWNER, HOSTED_ORDER);
      expect.unreachable("una referencia de otro motor no puede pasar");
    } catch (error) {
      expect((error as CommerceOwnerMismatchError).violation).toBe("engine_mismatch");
    }
  });
});

describe("claves", () => {
  it("distinguen conexión, tipo y revisión", () => {
    expect(refKey(OWN_VARIANT)).toBe("native:native-es:variant:var_1");
    // Dos revisiones son dos cachés: si la clave no llevara la revisión, un
    // cambio de binding serviría catálogo viejo (invariante 6).
    expect(ownerKey(OWNER)).toBe("courvia:native:native-es:r2");
    expect(ownerKey({ ...OWNER, bindingRevision: 3 })).not.toBe(ownerKey(OWNER));
    // Y el mismo id en dos conexiones no es la misma cosa.
    expect(refKey({ ...OWN_VARIANT, connectionKey: "native-uk" })).not.toBe(refKey(OWN_VARIANT));
  });
});
