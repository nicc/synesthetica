/**
 * GPU resource disposal for Three.js objects.
 *
 * Three.js does not free GPU memory when an object leaves the scene;
 * geometries, materials and textures must each be disposed explicitly.
 * Material.dispose() in particular does not dispose the textures it
 * references, so text labels (one CanvasTexture each) leak unless the
 * map is disposed alongside the material.
 */

import * as THREE from "three";

/**
 * Dispose a material and every texture it owns: `map` and any
 * texture-valued shader uniforms.
 */
export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  for (const m of materials) {
    const map = (m as THREE.Material & { map?: THREE.Texture | null }).map;
    if (map instanceof THREE.Texture) map.dispose();
    if (m instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(m.uniforms)) {
        if (uniform.value instanceof THREE.Texture) uniform.value.dispose();
      }
    }
    m.dispose();
  }
}

/**
 * Dispose an object's geometry and materials, recursing into groups.
 * Geometries in `shared` are owned by the caller and left alone.
 */
export function disposeObject(
  obj: THREE.Object3D,
  shared: ReadonlySet<THREE.BufferGeometry> = new Set(),
): void {
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
    // instanceof narrows to Mesh<any, any>; restore the default generics.
    const drawable: THREE.Mesh | THREE.Line = obj;
    if (!shared.has(drawable.geometry)) drawable.geometry.dispose();
    disposeMaterial(drawable.material);
  } else if (obj instanceof THREE.Group) {
    for (const child of obj.children) {
      disposeObject(child, shared);
    }
  }
}
