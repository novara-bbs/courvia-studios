#!/usr/bin/env node
/**
 * Alambre trampa para el Root Directory de Vercel.
 *
 * Vercel lee `vercel.json` **desde el Root Directory**, así que este fichero
 * solo se ejecuta cuando ese ajuste apunta a la raíz del repositorio — es
 * decir, cuando está mal. La configuración buena vive en
 * `apps/web/vercel.json` y, con Root Directory = `apps/web`, este guion no
 * llega a correr nunca.
 *
 * Por qué existe: con Root Directory en la raíz, el build **funciona**
 * —turbo compila los catorce paquetes, Next termina— y luego Vercel falla
 * recogiendo la salida con «No Output Directory named "public" found». Ese
 * mensaje no dice la verdad: no falta una carpeta, sobra un ajuste. Costó
 * tres días de despliegues rojos con CI en verde.
 *
 * Aun así el guion **comprueba** antes de fallar, en vez de dar por hecho
 * dónde está: si algún día Vercel cambiara y leyese este fichero también con
 * el Root Directory bien puesto, una trampa incondicional dejaría la web sin
 * desplegar. La señal es el directorio de trabajo: si contiene el
 * `pnpm-workspace.yaml`, el build arrancó en la raíz.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const atRepoRoot = existsSync(join(cwd, "pnpm-workspace.yaml"));

if (!atRepoRoot) {
  // No es el caso que esta trampa vigila. Delega en la configuración real.
  console.log(`vercel-root-guard: build lanzado desde ${cwd}, nada que vigilar.`);
  process.exit(0);
}

console.error(
  [
    "",
    "  El Root Directory de este proyecto de Vercel apunta a la raíz del",
    "  monorepo. Desde ahí Vercel no ve una app de Next: ve una carpeta.",
    "  El build llegaría a terminar y moriría después buscando un public/",
    "  que no existe, con un mensaje que no dice cuál es el problema.",
    "",
    "  Arreglo, en Project Settings → Build and Deployment:",
    "",
    "    1. Root Directory  ->  apps/web",
    "    2. Marcar «Include source files outside of the Root Directory",
    "       in the Build Step» (el build necesita los paquetes del",
    "       workspace y el lockfile de la raíz).",
    "",
    "  Después, todo lo demás sale de apps/web/vercel.json, que ya está en",
    "  el repositorio. No hay nada que cambiar aquí.",
    "",
    "  Contexto completo: docs/deployment.md",
    "",
  ].join("\n"),
);

process.exit(1);
