export interface VerificationRecord {
  id: string;
  authoringId: string;
  verifierId: string;
  isApproved: boolean;
  comments?: string;
  signedAt: string;
  signature: string;
}

export function signVerification(
  authoringId: string,
  verifierId: string,
  isApproved: boolean,
  comments?: string
): VerificationRecord {
  const signedAt = new Date().toISOString();
  // Simple signature simulation
  const signature = `SIG-${authoringId}-${verifierId}-${signedAt}`;
  
  return {
    id: crypto.randomUUID(),
    authoringId,
    verifierId,
    isApproved,
    comments,
    signedAt,
    signature,
  };
}
