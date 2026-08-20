/**
 * Seeds the media library from the frozen render pack in
 * `brand/product-renders/` and attaches the PUBLIC assets to their products
 * in the canonical gallery order (hero → detail → schematic).
 *
 * Governance travels with the file: `manifest.json` carries each asset's
 * register state — `blocked` assets are uploaded for traceability but the
 * commerce adapter excludes them from the storefront, and everything
 * non-photographic renders with the "render conceptual" label (E-028).
 *
 * Idempotent: an asset whose assetCode/filename already exists is skipped.
 *
 *   pnpm --filter @courvia/web seed:media
 */
// Default-import interop: @next/env ships bundled CJS whose named exports
// the ESM lexer cannot detect statically.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../../payload.config");

const payload = await getPayload({ config });

const dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDERS = path.resolve(dirname, "../../../../brand/product-renders");

interface ManifestAsset {
  file: string;
  registerId: string | null;
  product: string | null;
  kind: string;
  status: "concept" | "blocked" | "published";
  blockedReason?: string;
  alt: { es: string; en: string; ar: string };
}

const manifest = JSON.parse(readFileSync(path.join(RENDERS, "manifest.json"), "utf8")) as {
  assets: ManifestAsset[];
};

/** Captions for the public assets (the internal ones don't need one). */
const CAPTIONS: Record<string, { es: string; en: string; ar: string }> = {
  "tempo-r1-hero-a002.webp": {
    es: "Tempo R1 · render conceptual sobre plataforma OEM, sujeto a CAD y DVT",
    en: "Tempo R1 · concept render on an OEM platform, subject to CAD and DVT",
    ar: "تيمبو R1 · تصور مفاهيمي على منصة OEM، رهن CAD وDVT",
  },
  "tempo-quickdock-system.webp": {
    es: "QuickDock: tolva Daily rígida y Coach Collar plegable sobre la misma base",
    en: "QuickDock: rigid Daily hopper and folding Coach Collar on the same base",
    ar: "QuickDock: خزان يومي صلب وطوق مدرب قابل للطي على القاعدة نفسها",
  },
  "go-pickleball-hero.webp": {
    es: "Go Pickleball · render conceptual: hardware dedicado para la bola perforada",
    en: "Go Pickleball · concept render: dedicated hardware for the perforated ball",
    ar: "غو بيكلبول · تصور مفاهيمي: عتاد مخصص للكرة المثقّبة",
  },
};

/** Generated blueprint diagrams: one per product, always labeled as CGI. */
const SCHEMATICS: Array<{ file: string; product: string; alt: ManifestAsset["alt"]; caption: ManifestAsset["alt"] }> = [
  {
    file: "schematics/tempo-r1-schematic.webp",
    product: "tempo-r1",
    alt: {
      es: "Diagrama lateral de Tempo R1 con objetivos de diseño: capacidad, peso y cadencia",
      en: "Tempo R1 side diagram with design targets: capacity, weight and interval",
      ar: "مخطط جانبي لتيمبو R1 مع أهداف التصميم",
    },
    caption: {
      es: "Diagrama CGI — todas las cifras son objetivos de diseño sin verificar",
      en: "CGI diagram — every figure is an unverified design target",
      ar: "مخطط CGI — كل الأرقام أهداف تصميمية غير مُتحقق منها",
    },
  },
  {
    file: "schematics/go-pickleball-schematic.webp",
    product: "go-pickleball",
    alt: {
      es: "Diagrama lateral de Go Pickleball con objetivos de diseño: capacidad, peso y primera bola",
      en: "Go Pickleball side diagram with design targets: capacity, weight and first ball",
      ar: "مخطط جانبي لغو بيكلبول مع أهداف التصميم",
    },
    caption: {
      es: "Diagrama CGI — todas las cifras son objetivos de diseño sin verificar",
      en: "CGI diagram — every figure is an unverified design target",
      ar: "مخطط CGI — كل الأرقام أهداف تصميمية غير مُتحقق منها",
    },
  },
  {
    file: "schematics/rally-station-schematic.webp",
    product: "rally-station",
    alt: {
      es: "Diagrama lateral de Rally Station con objetivos de diseño: capacidad, peso y alimentación",
      en: "Rally Station side diagram with design targets: capacity, weight and power",
      ar: "مخطط جانبي لرالي ستيشن مع أهداف التصميم",
    },
    caption: {
      es: "Diagrama CGI — todas las cifras son objetivos de diseño sin verificar",
      en: "CGI diagram — every figure is an unverified design target",
      ar: "مخطط CGI — كل الأرقام أهداف تصميمية غير مُتحقق منها",
    },
  },
];

/** Media doc per product slug, in PDP gallery order. */
const galleries = new Map<string, number[]>();

function track(product: string | null, id: number): void {
  if (product === null) return;
  const list = galleries.get(product) ?? [];
  list.push(id);
  galleries.set(product, list);
}

async function uploadAsset(input: {
  file: string;
  kind: string;
  status: "concept" | "blocked" | "published";
  assetCode?: string | null;
  alt: ManifestAsset["alt"];
  caption?: ManifestAsset["alt"];
  product: string | null;
}): Promise<void> {
  const filename = path.basename(input.file);
  const existing = await payload.find({
    collection: "media",
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.totalDocs > 0) {
    track(input.product, existing.docs[0]!.id);
    console.log(`media/${filename} already exists — skipped.`);
    return;
  }
  const doc = await payload.create({
    collection: "media",
    locale: "es",
    overrideAccess: true,
    filePath: path.join(RENDERS, input.file),
    data: {
      alt: input.alt.es,
      caption: input.caption?.es,
      kind: input.kind as never,
      assetCode: input.assetCode ?? undefined,
      evidenceStatus: input.status,
    },
  });
  for (const locale of ["en", "ar"] as const) {
    await payload.update({
      collection: "media",
      id: doc.id,
      locale,
      overrideAccess: true,
      data: { alt: input.alt[locale], caption: input.caption?.[locale] },
    });
  }
  track(input.product, doc.id);
  console.log(`media/${filename} uploaded (${input.status}).`);
}

// Delivered renders first (hero before detail per manifest order)…
for (const asset of manifest.assets) {
  await uploadAsset({
    file: asset.file,
    kind: asset.kind,
    status: asset.status,
    assetCode: asset.registerId,
    alt: asset.alt,
    caption: CAPTIONS[asset.file],
    product: asset.status === "blocked" ? null : asset.product,
  });
}
// …then the generated diagrams, closing each gallery.
for (const schematic of SCHEMATICS) {
  await uploadAsset({
    file: schematic.file,
    kind: "schematic",
    status: "concept",
    alt: schematic.alt,
    caption: schematic.caption,
    product: schematic.product,
  });
}

/* ------------------------------------------------- attach to the products */
for (const [slug, imageIds] of galleries) {
  const product = (
    await payload.find({
      collection: "products",
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0];
  if (product === undefined) {
    console.warn(`products/${slug} not found — gallery not attached.`);
    continue;
  }
  const current = (product.images ?? []).map((img) =>
    typeof img === "object" && img !== null ? (img as { id: number }).id : (img as number),
  );
  if (current.length > 0) {
    console.log(`products/${slug} already has images — skipped (editor changes win).`);
    continue;
  }
  await payload.update({
    collection: "products",
    id: product.id,
    draft: false,
    overrideAccess: true,
    data: { images: imageIds, _status: "published" },
  });
  console.log(`products/${slug}: ${imageIds.length} image(s) attached.`);
}

console.log("Media seed complete.");
process.exit(0);
