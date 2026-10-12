import * as THREE from "three";

/**
 * Pistolet IEM tenu dans la main droite d'un personnage du squelette « Universal » (agent comme sentinelle).
 * Accessoire, pas le corps : des formes simples suffisent. Repère de l'os hand_r : Y suit les doigts (le canon),
 * Z sort du dos de la main (le dessus de l'arme). `own` enregistre chaque géométrie pour que l'appelant la libère.
 */
export function createPistolProp(gear: THREE.Material, glow: THREE.Material, own: <T extends THREE.BufferGeometry>(geometry: T) => T): THREE.Group {
  const pistol = new THREE.Group();
  const slide = new THREE.Mesh(own(new THREE.BoxGeometry(0.034, 0.2, 0.05)), gear);
  slide.position.set(0, 0.11, 0.06);
  const grip = new THREE.Mesh(own(new THREE.BoxGeometry(0.03, 0.05, 0.09)), gear);
  grip.position.set(0, 0.06, 0.02);
  // Bobine au bout du canon : CylinderGeometry est déjà dans l'axe Y, celui du canon.
  const coil = new THREE.Mesh(own(new THREE.CylinderGeometry(0.024, 0.024, 0.04, 10)), glow);
  coil.position.set(0, 0.22, 0.06);
  pistol.add(slide, grip, coil);
  return pistol;
}
