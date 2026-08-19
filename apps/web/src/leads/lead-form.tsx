"use client";

/**
 * Demo/quote request form. Labels arrive as props from the server component
 * so the client bundle never ships a message catalog; validation is
 * decorative here and authoritative in the server action.
 */
import { useActionState } from "react";

import { createLead, type LeadFormState } from "./create-lead";

export interface LeadFormLabels {
  title: string;
  name: string;
  email: string;
  message: string;
  consent: string;
  submit: string;
  invalid: string;
}

const initialState: LeadFormState = { status: "idle" };

export function LeadForm({
  labels,
  region,
  productId,
  sourcePath,
  sportInterest,
}: {
  labels: LeadFormLabels;
  region: string;
  productId?: string;
  sourcePath: string;
  sportInterest?: string;
}) {
  const [state, formAction, pending] = useActionState(createLead, initialState);

  return (
    <form className="lead-form" action={formAction}>
      <h2>{labels.title}</h2>

      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="sourcePath" value={sourcePath} />
      {productId === undefined ? null : <input type="hidden" name="productId" value={productId} />}
      {sportInterest === undefined ? null : (
        <input type="hidden" name="sportInterest" value={sportInterest} />
      )}
      {/* Honeypot: visually hidden, tab-skipped; bots fill it, humans never see it. */}
      <div className="lead-form-hp" aria-hidden="true">
        <label>
          website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <label>
        <span>{labels.name}</span>
        <input type="text" name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label>
        <span>{labels.email}</span>
        <input type="email" name="email" required maxLength={254} autoComplete="email" />
      </label>
      <label>
        <span>{labels.message}</span>
        <textarea name="message" rows={4} maxLength={1000} />
      </label>
      <label className="lead-form-consent">
        <input type="checkbox" name="consent" required />
        <span>{labels.consent}</span>
      </label>

      {state.status === "invalid" ? (
        <p className="lead-form-error" role="alert">
          {labels.invalid}
        </p>
      ) : null}

      <button type="submit" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  );
}
