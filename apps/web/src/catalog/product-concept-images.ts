import type { StaticImageData } from "next/image";

import goHero from "../../../../brand/product-renders/go-pickleball-hero.webp";
import goSchematic from "../../../../brand/product-renders/schematics/go-pickleball-schematic.webp";
import rallySchematic from "../../../../brand/product-renders/schematics/rally-station-schematic.webp";
import tempoSchematic from "../../../../brand/product-renders/schematics/tempo-r1-schematic.webp";
import tempoHero from "../../../../brand/product-renders/tempo-r1-hero-a002.webp";
import tempoQuickDock from "../../../../brand/product-renders/tempo-quickdock-system.webp";

type SupportedLocale = "ar" | "en" | "es";

interface LocalizedText {
  ar: string;
  en: string;
  es: string;
}

interface ConceptSource {
  key: string;
  src: StaticImageData;
  alt: LocalizedText;
  caption: LocalizedText;
}

export interface ConceptProductImage {
  key: string;
  src: StaticImageData;
  alt: string;
  caption: string;
  concept: true;
}

/**
 * Frozen V0.4 assets that the evidence manifest explicitly marks as public
 * concepts. They are a storefront fallback, not a second media library: as
 * soon as Payload supplies an editor-managed gallery, that gallery wins.
 *
 * Keeping the fallback in the bundle makes the first deploy honest and
 * useful even before an S3-compatible bucket is connected. Serverless local
 * uploads are deliberately disabled because they would disappear on the
 * next deployment.
 */
const CONCEPTS_BY_PRODUCT: Readonly<Record<string, readonly ConceptSource[]>> = {
  "tempo-r1": [
    {
      key: "tempo-r1-hero-a002",
      src: tempoHero,
      alt: {
        es: "Robot de entrenamiento Courvia Tempo R1, render conceptual: tolva llena, asa telescópica y cuerpo azul marino",
        en: "Courvia Tempo R1 training robot, concept render: full hopper, telescopic handle and deep navy body",
        ar: "روبوت التدريب كورفيا تيمبو R1، تصور مفاهيمي: خزان ممتلئ ومقبض تلسكوبي وهيكل كحلي",
      },
      caption: {
        es: "Tempo R1 · render conceptual sobre plataforma OEM, sujeto a CAD y DVT",
        en: "Tempo R1 · concept render on an OEM platform, subject to CAD and DVT",
        ar: "تيمبو R1 · تصور مفاهيمي على منصة OEM، رهن CAD وDVT",
      },
    },
    {
      key: "tempo-quickdock-system",
      src: tempoQuickDock,
      alt: {
        es: "Sistema QuickDock de Tempo, render conceptual: tolva Daily, Coach Collar plegable y anillo de acoplamiento",
        en: "Tempo QuickDock system, concept render: Daily hopper, folding Coach Collar and docking ring",
        ar: "نظام QuickDock من تيمبو، تصور مفاهيمي: خزان يومي وطوق المدرب القابل للطي وحلقة الإرساء",
      },
      caption: {
        es: "QuickDock: tolva Daily rígida y Coach Collar plegable sobre la misma base",
        en: "QuickDock: rigid Daily hopper and folding Coach Collar on the same base",
        ar: "QuickDock: خزان يومي صلب وطوق مدرب قابل للطي على القاعدة نفسها",
      },
    },
    {
      key: "tempo-r1-schematic",
      src: tempoSchematic,
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
  ],
  "go-pickleball": [
    {
      key: "go-pickleball-hero",
      src: goHero,
      alt: {
        es: "Courvia Go Pickleball, render conceptual: máquina compacta con tolva abierta y asa de carro",
        en: "Courvia Go Pickleball, concept render: compact machine with open hopper and trolley handle",
        ar: "كورفيا غو بيكلبول، تصور مفاهيمي: جهاز مدمج بخزان مفتوح ومقبض عربة",
      },
      caption: {
        es: "Go Pickleball · render conceptual: hardware dedicado para la bola perforada",
        en: "Go Pickleball · concept render: dedicated hardware for the perforated ball",
        ar: "غو بيكلبول · تصور مفاهيمي: عتاد مخصص للكرة المثقّبة",
      },
    },
    {
      key: "go-pickleball-schematic",
      src: goSchematic,
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
  ],
  "rally-station": [
    {
      key: "rally-station-schematic",
      src: rallySchematic,
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
  ],
};

function supportedLocale(locale: string): SupportedLocale {
  if (locale === "es" || locale === "ar") return locale;
  return "en";
}

export function conceptImageCountForProduct(slug: string): number {
  return CONCEPTS_BY_PRODUCT[slug]?.length ?? 0;
}

export function conceptImagesForProduct(
  slug: string,
  locale: string,
): readonly ConceptProductImage[] {
  const resolvedLocale = supportedLocale(locale);
  return (CONCEPTS_BY_PRODUCT[slug] ?? []).map((image) => ({
    key: image.key,
    src: image.src,
    alt: image.alt[resolvedLocale],
    caption: image.caption[resolvedLocale],
    concept: true,
  }));
}
