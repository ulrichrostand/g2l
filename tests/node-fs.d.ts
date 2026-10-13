/**
 * Déclaration minimale de node:fs pour les tests (vitest tourne sous Node) : le projet n'installe pas
 * @types/node, qui ferait entrer les types Node dans le code du navigateur.
 */
declare module "node:fs" {
  export function readFileSync(path: string): Uint8Array;
  export function existsSync(path: string): boolean;
}
