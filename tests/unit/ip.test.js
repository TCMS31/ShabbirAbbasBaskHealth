import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { anonymizeIp } from "../../src/utils/ip.js";

describe("anonymizeIp", () => {
  test("stores the address verbatim in full mode", () => {
    assert.equal(anonymizeIp("203.0.113.42", "full"), "203.0.113.42");
  });

  test("drops the final IPv4 octet in anonymized mode", () => {
    assert.equal(anonymizeIp("203.0.113.42", "anonymized"), "203.0.113.0");
  });

  test("keeps only the /48 prefix of an IPv6 address in anonymized mode", () => {
    assert.equal(
      anonymizeIp("2001:db8:85a3:8d3:1319:8a2e:370:7348", "anonymized"),
      "2001:db8:85a3::",
    );
  });

  test("anonymizes compressed IPv6 forms without producing a malformed prefix", () => {
    assert.equal(anonymizeIp("::1", "anonymized"), "0:0:0::");
    assert.equal(anonymizeIp("2001:db8::5", "anonymized"), "2001:db8:0::");
    assert.equal(anonymizeIp("fe80::1%eth0", "anonymized"), "fe80:0:0::");
  });

  test("treats IPv4-mapped IPv6 as IPv4 in anonymized mode", () => {
    assert.equal(anonymizeIp("::ffff:203.0.113.42", "anonymized"), "::ffff:203.0.113.0");
  });

  test("does not store unparseable input verbatim in anonymized mode", () => {
    assert.equal(anonymizeIp("not-an-ip", "anonymized"), "unknown");
  });

  test("stores nothing identifying in none mode", () => {
    assert.equal(anonymizeIp("203.0.113.42", "none"), "redacted");
  });

  test("substitutes a placeholder when the address is missing", () => {
    assert.equal(anonymizeIp(undefined, "full"), "unknown");
    assert.equal(anonymizeIp("", "anonymized"), "unknown");
  });

  test("never exceeds the ip_address column width", () => {
    assert.ok(anonymizeIp("a".repeat(200), "full").length <= 64);
  });
});
