import { createValidationError } from "./errors.js";

/** `urls.original_url` is TEXT; this cap keeps requests well inside it. */
export const MAX_URL_LENGTH = 2048;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Validates a candidate long URL and returns its normalized form.
 *
 * Normalizing through `URL` also neutralises header-injection attempts: the
 * stored value is later echoed into a `Location` header, and `URL` percent
 * encodes any CR/LF before it can get there.
 */
export const normalizeLongUrl = (candidateUrl) => {
  if (typeof candidateUrl !== "string" || candidateUrl.trim() === "") {
    throw createValidationError("The `url` field is required and must be a string.");
  }

  const trimmed = candidateUrl.trim();

  if (trimmed.length > MAX_URL_LENGTH) {
    throw createValidationError(`URL must be at most ${MAX_URL_LENGTH} characters.`, {
      maxLength: MAX_URL_LENGTH,
      actualLength: trimmed.length,
    });
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw createValidationError("Invalid URL format.");
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw createValidationError("Only http and https URLs are supported.", {
      allowedProtocols: [...ALLOWED_PROTOCOLS],
    });
  }

  if (parsedUrl.hostname === "") {
    throw createValidationError("URL must include a host.");
  }

  // Percent-encoding can grow the string well past the raw input (each
  // non-ASCII character becomes up to 12 bytes), so the cap is applied to what
  // is actually stored and later sent in the Location header.
  const normalizedUrl = parsedUrl.toString();

  if (normalizedUrl.length > MAX_URL_LENGTH) {
    throw createValidationError(`URL must be at most ${MAX_URL_LENGTH} characters once encoded.`, {
      maxLength: MAX_URL_LENGTH,
      actualLength: normalizedUrl.length,
    });
  }

  return normalizedUrl;
};
