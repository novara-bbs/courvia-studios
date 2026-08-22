/**
 * El quitado de comentarios, con el caso que lo rompe.
 *
 * No es ceremonia: la primera línea de `turbo.json` es
 * `"$schema": "https://turborepo.com/schema.json"`, y la versión ingenua de
 * esta función —un `replace(/\/\/.*$/gm, "")`— la parte por la mitad y deja
 * el fichero inservible. Un arreglo que pasa sus propios tests y rompe el de
 * al lado es peor que el problema que venía a resolver.
 */
import { describe, expect, it } from "vitest";

import { stripJsonComments } from "./turbo-json";

describe("JSONC → JSON sin tocar lo que va entre comillas", () => {
  it("no parte una URL por sus dos barras", () => {
    const source = '{ "$schema": "https://turborepo.com/schema.json" }';
    expect(JSON.parse(stripJsonComments(source))).toEqual({
      $schema: "https://turborepo.com/schema.json",
    });
  });

  it("quita comentarios de línea y de bloque", () => {
    const source = `{
      // el porqué
      "a": 1,
      /* y el porqué largo
         en dos líneas */
      "b": [2, 3]
    }`;
    expect(JSON.parse(stripJsonComments(source))).toEqual({ a: 1, b: [2, 3] });
  });

  it("respeta unas barras dentro de una cadena escapada", () => {
    const source = String.raw`{ "a": "dice \" // no es comentario", "b": 1 }`;
    expect(JSON.parse(stripJsonComments(source))).toEqual({
      a: 'dice " // no es comentario',
      b: 1,
    });
  });

  it("conserva los saltos de línea, para que un error señale la línea real", () => {
    const source = '{\n// uno\n// dos\n"a": 1\n}';
    expect(stripJsonComments(source).split("\n")).toHaveLength(5);
  });
});
