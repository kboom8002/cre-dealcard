export type AuthoringState = 'draft' | 'collecting' | 'authoring' | 'verifying' | 'ready' | 'published';

export interface AuthoringWorkflow {
  id: string;
  dealId: string;
  currentState: AuthoringState;
  updatedAt: string;
}

export function transitionState(current: AuthoringState, event: string): AuthoringState {
  switch (current) {
    case 'draft':
      if (event === 'START_COLLECTION') return 'collecting';
      break;
    case 'collecting':
      if (event === 'START_AUTHORING') return 'authoring';
      break;
    case 'authoring':
      if (event === 'SUBMIT_FOR_VERIFICATION') return 'verifying';
      break;
    case 'verifying':
      if (event === 'VERIFY_SUCCESS') return 'ready';
      if (event === 'VERIFY_FAIL') return 'authoring';
      break;
    case 'ready':
      if (event === 'PUBLISH') return 'published';
      break;
    case 'published':
      if (event === 'UNPUBLISH') return 'ready';
      break;
  }
  return current;
}
