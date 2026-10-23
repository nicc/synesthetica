import { describe, it, expect } from "vitest";
import { resolveAgainstPage } from "../../src/audio/AudioInputAdapter";

describe("resolveAgainstPage", () => {
  it("resolves a relative model URL against the page, not the worker's location", () => {
    // Static CLI build (page at the root) and the hosted subpath build.
    expect(resolveAgainstPage("./models/basic-pitch/model.json", "http://localhost:58721/?ws-port=1"))
      .toBe("http://localhost:58721/models/basic-pitch/model.json");
    expect(resolveAgainstPage("./models/basic-pitch/model.json", "https://example.com/synesthetica/"))
      .toBe("https://example.com/synesthetica/models/basic-pitch/model.json");
  });

  it("keeps a directory URL's trailing slash (tfjs wasm path prefix) under a subpath", () => {
    expect(resolveAgainstPage("./models/tfjs-wasm/", "https://example.com/synesthetica/"))
      .toBe("https://example.com/synesthetica/models/tfjs-wasm/");
  });

  it("leaves absolute URLs alone", () => {
    expect(resolveAgainstPage("https://cdn.example/model.json", "http://localhost:5173/"))
      .toBe("https://cdn.example/model.json");
  });
});
