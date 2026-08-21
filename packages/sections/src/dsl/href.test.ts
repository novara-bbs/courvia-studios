import { describe, expect, it } from "vitest";

import { isAuthoredHref } from "./href";

describe("what a destination field accepts", () => {
  it.each([
    ["/robots/tempo-r1", "the region-relative form the help text asks for"],
    ["/", "the region root"],
    ["/es/robots", "legacy content with the region already baked in"],
    ["#especificaciones", "an anchor on the same page"],
    ["https://instagram.com/courvia", "an off-site link"],
    ["HTTPS://EXAMPLE.COM", "a scheme somebody shouted"],
    ["mailto:hola@courvia.com", "an email address"],
    ["tel:+34600000000", "a phone number"],
    ["/robots?deporte=padel#specs", "a path with query and fragment"],
  ])("accepts %j — %s", (href) => {
    expect(isAuthoredHref(href)).toBe(true);
  });

  it.each([
    [
      "robots/tempo-r1",
      "one missing slash: the browser would resolve it against the current page",
    ],
    [
      "www.courvia.com",
      "a domain with no scheme is a relative path to the browser",
    ],
    ["javascript:alert(1)", "React would render a button that throws on click"],
    ["JavaScript:alert(1)", "the same, shouted"],
    [
      "data:text/html,<script>alert(1)</script>",
      "the same idea by another scheme",
    ],
    ["/robots /tempo-r1", "a stray space inside a path"],
    [" /robots", "a leading space, which a paste leaves behind"],
    ["/robots ", "a trailing space, which is invisible in the input"],
    ["", "empty — `required` judges emptiness, this judges shape"],
    ["   ", "whitespace pretending to be a value"],
  ])("refuses %j — %s", (href) => {
    expect(isAuthoredHref(href)).toBe(false);
  });
});
