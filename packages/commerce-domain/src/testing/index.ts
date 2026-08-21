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
export {
  describeAvailabilityContract,
  describeCartContract,
  describeCatalogAdminContract,
  describeCatalogReadContract,
  describeCheckoutStartContract,
  describeCustomerOrderContract,
  describeEngineCapabilitiesContract,
  describeEngineEventIngestContract,
  describeReturnWriteContract,
} from "./engine-contracts";
export type {
  AvailabilityFixtures,
  CartFixtures,
  CatalogAdminFixtures,
  CatalogReadFixtures,
  CheckoutFixtures,
  CustomerOrderFixtures,
  EngineEventFixtures,
  ReturnFixtures,
} from "./engine-contracts";
export type {
  CatalogFixtures,
  CommerceServiceFixtures,
  ConnectedCapabilities,
  PaymentProviderFixtures,
  WebhookAuthScheme,
  WebhookDelivery,
} from "./contracts";
export * from "../fakes";
