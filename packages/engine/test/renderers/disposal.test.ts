import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { disposeObject } from "../../src/renderers/disposal";

/** Records whether a Three.js resource dispatched its "dispose" event. */
function track(resource: THREE.EventDispatcher<{ dispose: object }>): () => boolean {
  let disposed = false;
  resource.addEventListener("dispose", () => {
    disposed = true;
  });
  return () => disposed;
}

describe("disposeObject", () => {
  it("disposes a mesh's texture map, not just its material", () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const geometry = new THREE.PlaneGeometry(1, 1);
    const textureDisposed = track(texture);
    const materialDisposed = track(material);
    const geometryDisposed = track(geometry);

    disposeObject(new THREE.Mesh(geometry, material));

    expect(textureDisposed()).toBe(true);
    expect(materialDisposed()).toBe(true);
    expect(geometryDisposed()).toBe(true);
  });

  it("disposes texture-valued shader uniforms", () => {
    const texture = new THREE.Texture();
    const material = new THREE.ShaderMaterial({ uniforms: { tex: { value: texture } } });
    const textureDisposed = track(texture);

    disposeObject(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));

    expect(textureDisposed()).toBe(true);
  });

  it("leaves shared geometries alone", () => {
    const shared = new THREE.CircleGeometry(1, 8);
    const sharedDisposed = track(shared);

    disposeObject(new THREE.Mesh(shared, new THREE.MeshBasicMaterial()), new Set([shared]));

    expect(sharedDisposed()).toBe(false);
  });

  it("recurses into groups", () => {
    const texture = new THREE.Texture();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture })));
    const textureDisposed = track(texture);

    disposeObject(group);

    expect(textureDisposed()).toBe(true);
  });
});
