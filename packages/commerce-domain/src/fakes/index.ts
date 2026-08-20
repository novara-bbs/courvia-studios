/**
 * In-memory port implementations, usable at RUNTIME — a preview deployment
 * with no gateway keys, a local dev database, a Storybook story.
 *
 * They live behind their own entry point because the sibling `/testing`
 * entry re-exports the contract suites, and those import `vitest` at module
 * scope. One import of `FakePaymentProvider` from `/testing` therefore drags
 * a test runner into the server bundle: the production build tree-shakes it
 * away and stays green, while `next dev` fails to evaluate the module and
 * the whole storefront 500s. Splitting the entry makes the mistake
 * impossible rather than merely discouraged.
 *
 * `/testing` re-exports everything here, so test files may keep using the
 * single import they always did.
 */
export { FakeCommerceService, makeFakeCatalog } from "./fake-commerce-service";
export type { FakeCatalog } from "./fake-commerce-service";
export { FakePaymentProvider, signFakePayload } from "./fake-payment-provider";
export type { FakeProviderPayload, FakePaymentProviderOptions } from "./fake-payment-provider";
