/**
 * @module PhotoSafety
 * @description Analyzes deal teaser photos to ensure they do not expose sensitive location data (re-identification risk).
 */

export interface PhotoSafetyResult {
  isSafe: boolean;
  reidentificationRiskScore: number; // 0 (no risk) to 1 (high risk)
  detectedRiskFactors: string[];
}

/**
 * Mocks the AI-based re-identification check for a teaser photo.
 * In a real environment, this would call an external Computer Vision service.
 */
export function simulateReidentification(photoUrl: string, title?: string): PhotoSafetyResult {
  const riskFactors: string[] = [];
  let riskScore = 0.1;

  if (photoUrl.includes('street-view') || photoUrl.includes('signboard')) {
    riskScore += 0.5;
    riskFactors.push('Visible street signs or store signboards detected');
  }

  if (photoUrl.includes('landmark')) {
    riskScore += 0.4;
    riskFactors.push('Famous landmark visible in background');
  }
  
  if (title?.includes('specific')) {
    riskScore += 0.3;
    riskFactors.push('Title contains highly specific location cues');
  }

  const isSafe = riskScore < 0.6;

  return {
    isSafe,
    reidentificationRiskScore: Math.min(riskScore, 1.0),
    detectedRiskFactors: riskFactors,
  };
}
