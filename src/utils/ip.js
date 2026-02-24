import { isIPv4, isIPv6 } from "node:net";

/** `url_clicks.ip_address` is VARCHAR(64); IPv6 with a zone fits comfortably. */
export const MAX_IP_LENGTH = 64;

const IPV4_MAPPED_PREFIX = "::ffff:";

const truncateIpv4 = (address) => `${address.split(".").slice(0, 3).join(".")}.0`;

/**
 * Expands an IPv6 address to its eight hextets so the prefix can be taken
 * positionally. Without this, compressed forms such as `::1` or `2001:db8::5`
 * have fewer than eight groups and slicing "the first three" yields either a
 * malformed string or a prefix that still identifies the host.
 */
const expandIpv6 = (address) => {
  const [head, tail = ""] = address.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = address.includes("::") && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;

  return [...headGroups, ...Array(Math.max(0, missing)).fill("0"), ...tailGroups];
};

/**
 * Reduces a client IP to the precision configured for click analytics.
 *
 * `full`       - store as received (the default; matches the original brief).
 * `anonymized` - drop the last IPv4 octet / keep only the /48 of an IPv6
 *                address, which keeps geo-level analytics while removing the
 *                identifier for a single household or device. IPv4-mapped
 *                IPv6 (`::ffff:203.0.113.42`, what Node reports for IPv4
 *                clients on a dual-stack socket) is treated as IPv4.
 * `none`       - store nothing identifying.
 */
export const anonymizeIp = (ipAddress, mode = "full") => {
  const value = typeof ipAddress === "string" && ipAddress !== "" ? ipAddress : "unknown";

  if (mode === "none") {
    return "redacted";
  }

  if (mode !== "anonymized" || value === "unknown") {
    return value.slice(0, MAX_IP_LENGTH);
  }

  if (isIPv4(value)) {
    return truncateIpv4(value);
  }

  const lowered = value.toLowerCase();

  if (lowered.startsWith(IPV4_MAPPED_PREFIX) && isIPv4(lowered.slice(IPV4_MAPPED_PREFIX.length))) {
    return `${IPV4_MAPPED_PREFIX}${truncateIpv4(lowered.slice(IPV4_MAPPED_PREFIX.length))}`;
  }

  const withoutZone = lowered.split("%")[0];

  if (isIPv6(withoutZone)) {
    return `${expandIpv6(withoutZone).slice(0, 3).join(":")}::`;
  }

  // Not an address we can reason about; storing it would defeat the mode.
  return "unknown";
};
