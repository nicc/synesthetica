import { describe, it, expect } from "vitest";
import { isLoopbackOrigin } from "../src/loopback.js";

describe("isLoopbackOrigin", () => {
  it("accepts loopback origins on any port", () => {
    expect(isLoopbackOrigin("http://localhost:58721")).toBe(true);
    expect(isLoopbackOrigin("http://localhost:5173")).toBe(true);
    expect(isLoopbackOrigin("http://127.0.0.1:58721")).toBe(true);
    expect(isLoopbackOrigin("http://[::1]:58721")).toBe(true);
  });

  it("accepts a missing Origin (non-browser client on this machine)", () => {
    expect(isLoopbackOrigin(undefined)).toBe(true);
  });

  it("rejects pages from other hosts", () => {
    expect(isLoopbackOrigin("https://example.com")).toBe(false);
    expect(isLoopbackOrigin("http://localhost.example.com")).toBe(false);
    expect(isLoopbackOrigin("http://192.168.1.20:58721")).toBe(false);
    expect(isLoopbackOrigin("null")).toBe(false);
  });
});
