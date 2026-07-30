/**
 * @module ConsentChain
 * @description CREDEAL v3 Consent Chain — manages the progression of access gates
 * from anonymous teaser viewing to authenticated Pro IM access.
 * @see SDD §8 S3-T5~T8
 */

export type ConsentTier = 'anonymous' | 'identified' | 'nda_signed' | 'pro_verified';

export interface ConsentState {
  currentTier: ConsentTier;
  grantId?: string;
  viewerEmail?: string;
  viewerName?: string;
  viewerPhone?: string;
  ndaSignedAt?: string;
  expiresAt?: string;
  watermarkSeed?: string;
}

export interface ConsentGateResult {
  allowed: boolean;
  requiredTier: ConsentTier;
  currentTier: ConsentTier;
  upgradeAction?: 'request_email' | 'sign_nda' | 'request_verification';
  message: string;
}

const TIER_LEVEL: Record<ConsentTier, number> = {
  anonymous: 0,
  identified: 1,
  nda_signed: 2,
  pro_verified: 3,
};

/**
 * Checks if the current consent tier allows access to the requested IM tier.
 * @param currentTier - The viewer's current consent level
 * @param requiredTier - The minimum consent level needed for the content
 * @returns Gate result with upgrade action if blocked
 */
export function checkConsentGate(
  currentTier: ConsentTier,
  requiredTier: ConsentTier
): ConsentGateResult {
  const currentLevel = TIER_LEVEL[currentTier];
  const requiredLevel = TIER_LEVEL[requiredTier];

  if (currentLevel >= requiredLevel) {
    return {
      allowed: true,
      requiredTier,
      currentTier,
      message: '접근이 허용되었습니다.',
    };
  }

  // Determine next upgrade step
  let upgradeAction: ConsentGateResult['upgradeAction'];
  let message: string;

  switch (requiredTier) {
    case 'identified':
      upgradeAction = 'request_email';
      message = '이메일 인증이 필요합니다.';
      break;
    case 'nda_signed':
      upgradeAction = 'sign_nda';
      message = '기밀유지동의(NDA)에 서명해야 열람할 수 있습니다.';
      break;
    case 'pro_verified':
      upgradeAction = 'request_verification';
      message = '전문 투자자 인증이 필요합니다.';
      break;
    default:
      message = '접근 권한이 부족합니다.';
  }

  return {
    allowed: false,
    requiredTier,
    currentTier,
    upgradeAction,
    message,
  };
}

/**
 * Determines the required consent tier for a given IM document tier.
 */
export function getRequiredConsentTier(imTier: 'teaser' | 'basic' | 'pro'): ConsentTier {
  switch (imTier) {
    case 'teaser': return 'anonymous';
    case 'basic': return 'identified';
    case 'pro': return 'nda_signed';
  }
}

/**
 * Generates a watermark seed for document tracking.
 */
export function generateWatermarkSeed(consent: ConsentState): string {
  const name = consent.viewerName || 'unknown';
  const phoneLast4 = (consent.viewerPhone || '').slice(-4);
  const timestamp = new Date().toISOString().slice(0, 16);
  return `${name}|${phoneLast4}|${timestamp}`;
}
