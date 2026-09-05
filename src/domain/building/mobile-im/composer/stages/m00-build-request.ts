import type { PublicationPackage } from '../../../im-core/publication/package-builder';

export function executeM00BuildRequest(
  pkg: PublicationPackage,
  requestedLevel: 'L1' | 'L1.5'
): { isValid: boolean; targetLevel: 'L1' | 'L1.5' } {
  if (!pkg || !pkg.packageHash) {
    throw new Error('M00_ERROR: PublicationPackage is invalid or unsealed');
  }

  if (requestedLevel === 'L1.5' && pkg.level !== 'L1.5' && pkg.level !== 'L2' && pkg.level !== 'L3') {
    throw new Error(
      `M00_ERROR: Requested level L1.5 is higher than package capability level (${pkg.level})`
    );
  }

  return {
    isValid: true,
    targetLevel: requestedLevel,
  };
}
