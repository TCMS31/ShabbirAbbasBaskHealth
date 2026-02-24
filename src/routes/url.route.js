import { Router } from "express";

/**
 * Route table.
 *
 * `GET /:shortUrl` is a catch-all for one path segment, so anything that must
 * not be mistaken for a short code has to be registered ahead of it. Express 5
 * forwards rejected promises from async handlers to the error chain itself.
 */
export const createUrlRouter = ({ urlController, writeLimiter, redirectLimiter }) => {
  const router = Router();

  router.post("/shorten", writeLimiter, urlController.createShortUrl);
  router.get("/:shortUrl", redirectLimiter, urlController.redirectShortUrl);

  return router;
};
