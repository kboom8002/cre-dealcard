/**
 * Inter-service authentication validator.
 * Ensures that endpoints called by other systems in the JS ecosystem
 * are authenticated with a shared secret key.
 */

export function validateInterServiceRequest(req: Request): boolean {
  const key = req.headers.get("x-service-api-key");
  const validKey = process.env.INTER_SERVICE_API_KEY;
  
  if (!validKey) {
    return false;
  }
  
  return key === validKey;
}

