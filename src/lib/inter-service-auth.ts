/**
 * Inter-service authentication validator.
 * Ensures that endpoints called by other systems in the JS ecosystem
 * are authenticated with a shared secret key.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function validateInterServiceRequest(req: Request): boolean {
  const key = (req.headers.get("x-service-api-key") ?? "").trim();
  const validKey = (process.env.INTER_SERVICE_API_KEY ?? "").trim();

  if (!validKey || !key) {
    return false;
  }

  const keyDigest = createHash("sha256").update(key).digest();
  const validDigest = createHash("sha256").update(validKey).digest();
  return timingSafeEqual(keyDigest, validDigest);
}

