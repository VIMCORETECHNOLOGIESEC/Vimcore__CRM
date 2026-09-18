import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env, parseCorsOrigins } from "../src/config/env.js";

describe("config/env — parseCorsOrigins (CORS_ORIGIN as a comma-separated list)", () => {
  it("keeps a single origin as a one-element list", () => {
    expect(parseCorsOrigins("http://localhost:5173")).toEqual(["http://localhost:5173"]);
  });

  it("splits by comma, trims whitespace and drops empty entries", () => {
    expect(parseCorsOrigins(" http://a.test , ,https://b.test,, ")).toEqual([
      "http://a.test",
      "https://b.test",
    ]);
  });

  it("never accepts the wildcard (incompatible with credentials)", () => {
    expect(parseCorsOrigins("*")).toEqual([]);
    expect(parseCorsOrigins("https://a.test, *")).toEqual(["https://a.test"]);
  });
});

describe("app — CORS_ORIGIN list is honored by the CORS middleware", () => {
  const original = env.CORS_ORIGIN;
  afterAll(() => {
    env.CORS_ORIGIN = original;
  });

  it("echoes each listed origin and omits the header for an unlisted one", async () => {
    env.CORS_ORIGIN = "http://a.test, http://b.test";
    const app = createApp();

    const a = await request(app).get("/api/v1/salud").set("Origin", "http://a.test");
    const b = await request(app).get("/api/v1/salud").set("Origin", "http://b.test");
    const c = await request(app).get("/api/v1/salud").set("Origin", "http://c.test");

    expect(a.headers["access-control-allow-origin"]).toBe("http://a.test");
    expect(b.headers["access-control-allow-origin"]).toBe("http://b.test");
    expect(c.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
