export interface ProduceRequest {
  id: string;
  dealId: string;
  requestedBy: string;
  ontologyVersion: string; // Pinning ontology version
  targetFormat: 'pdf' | 'web';
  requestedAt: string;
}

export function createProduceRequest(
  dealId: string,
  requestedBy: string,
  targetFormat: 'pdf' | 'web',
  ontologyVersion: string
): ProduceRequest {
  return {
    id: crypto.randomUUID(),
    dealId,
    requestedBy,
    ontologyVersion,
    targetFormat,
    requestedAt: new Date().toISOString(),
  };
}
