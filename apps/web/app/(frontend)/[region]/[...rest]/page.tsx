import { notFound } from "next/navigation";

/** Unknown paths inside a region resolve to the localized 404. */
export default function CatchAll() {
  notFound();
}
