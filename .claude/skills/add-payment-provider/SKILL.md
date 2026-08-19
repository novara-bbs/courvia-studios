---
name: add-payment-provider
description: Integrate a payment gateway behind the Courvia PaymentProvider port. Use when adding Stripe, Tabby, Tamara, Adyen or any checkout provider. Requires human approval.
---

Follow [`docs/recipes/add-payment-provider.md`](../../../docs/recipes/add-payment-provider.md) exactly.

Read it before writing any code, and also read `.claude/rules/` for the area you are touching. If the recipe and the code disagree, the code wins — fix the recipe in the same pull request.

Finish with `pnpm verify` green.
