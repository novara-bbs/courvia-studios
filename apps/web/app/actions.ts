"use server";

import { THEME_ALIASES } from "@courvia/design-tokens";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

export async function setTheme(formData: FormData): Promise<void> {
  const value = formData.get("theme");
  if (typeof value === "string" && value in THEME_ALIASES) {
    (await cookies()).set("cv-theme", value, {
      path: "/",
      maxAge: ONE_YEAR_S,
      sameSite: "lax",
    });
  }
  revalidatePath("/");
}
