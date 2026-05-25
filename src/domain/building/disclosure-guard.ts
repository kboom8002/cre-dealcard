import { DisclosurePrefs } from '@/types/database';

export interface DisclosureValidationResult {
  canGenerateTeaser: boolean;
  violations: string[];
}

export function validateDisclosurePrefs(prefs: DisclosurePrefs): DisclosureValidationResult {
  const violations: string[] = [];

  // exact address must be hidden for blind teaser
  if (prefs.hide_exact_address === false) {
    violations.push('exact_address_not_hidden');
  }

  // tenant names must be hidden for blind teaser
  if (prefs.hide_tenant_names === false) {
    violations.push('tenant_names_not_hidden');
  }

  // unit-level rent must be hidden for blind teaser
  if (prefs.hide_unit_rent === false) {
    violations.push('unit_rent_not_hidden');
  }

  return {
    canGenerateTeaser: violations.length === 0,
    violations,
  };
}
