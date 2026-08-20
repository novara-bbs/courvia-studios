/**
 * Test-only entry point: the contract suites import `vitest` at module
 * scope, so importing anything from here pulls a test runner in. Runtime
 * code wanting a fake must use `@courvia/commerce-domain/fakes` instead —
 * the same objects, without that cost.
 */
export {
  describeCatalogContract,
  describeCommerceServiceContract,
  describePaymentProviderContract,
} from "./contracts";
export type {
  CatalogFixtures,
  CommerceServiceFixtures,
  PaymentProviderFixtures,
} from "./contracts";
export * from "../fakes";
