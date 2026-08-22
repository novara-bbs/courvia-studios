/**
 * `turbo.json` como lo lee turbo, que no es como lo lee `JSON.parse`.
 *
 * Turborepo acepta JSONC: comentarios `//` y `/* … *\/`. Dos tests de este
 * repo lo parseaban con `JSON.parse` y funcionaron durante meses porque nadie
 * había escrito un comentario; el primero que se escribió los tumbó a los dos
 * con «Expected double-quoted property name in JSON». O sea: el formato del
 * fichero no era el que los tests creían, y lo que los mantenía verdes era
 * que el fichero no usaba la mitad de su sintaxis.
 *
 * El quitado de comentarios es consciente de las CADENAS, y no por elegancia:
 * la primera línea del fichero es `"$schema": "https://turborepo.com/schema.json"`,
 * y un `replace(/\/\/.*$/gm, "")` ingenuo la parte por la mitad. Esa es
 * exactamente la clase de arreglo que pasa sus propios tests y rompe el
 * fichero de al lado.
 */
import { readFileSync } from "node:fs";

/** JSONC → JSON, respetando lo que va entre comillas. */
export function stripJsonComments(source: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      // Hasta el fin de línea, y el salto se conserva para que los números de
      // línea de un error de parseo sigan señalando al sitio de verdad.
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

export function readTurboJson(path: string): unknown {
  return JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
}
