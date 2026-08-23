import { describe, it } from "node:test";
import assert from "node:assert";
import { Database } from "../src/lib/ourin-database.js";

describe("Database with Turso backend", () => {
  it("creates stores with defaults", () => {
    const db = new Database("/tmp/test-turso-db");
    // local-only test — no Turso client needed
    assert.ok(db.stores);
    assert.equal(typeof db.getUser, "function");
  });
});
