'use client';

/**
 * Onboarding State — React Context + useReducer
 *
 * Zustand is not installed; using Context + useReducer instead.
 * Persists to localStorage key 'dealcard_onboarding' on every change.
 * File (photoFile) is intentionally excluded from localStorage serialisation.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  ExpertSpecialty,
  OnboardingData,
  OnboardingStage,
  Region,
  UserRole,
  VibeAnalysisResult,
} from './onboarding-types';

// ── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dealcard_onboarding';

// ── State shape ──────────────────────────────────────────────────────────────

export interface OnboardingState {
  stage: OnboardingStage;
  data: OnboardingData;
  /** ISO timestamps keyed by stage name — for analytics */
  stageTimestamps: Partial<Record<OnboardingStage, string>>;
}

const INITIAL_DATA: OnboardingData = {
  role: null,
  photoFile: null,
  photoPreviewUrl: null,
  photoUploadedUrl: null,
  vibeResult: null,
  userName: null,
  userPhone: null,
  specialty: null,
  region: null,
  radarAddress: null,
  firstDealCardId: null,
  sessionToken: null,
};

const INITIAL_STATE: OnboardingState = {
  stage: 'role_select',
  data: INITIAL_DATA,
  stageTimestamps: {},
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type OnboardingAction =
  | { type: 'SET_STAGE'; stage: OnboardingStage }
  | { type: 'SET_ROLE'; role: UserRole }
  | { type: 'SET_PHOTO_FILE'; file: File; previewUrl: string }
  | { type: 'SET_PHOTO_UPLOADED_URL'; url: string }
  | { type: 'SET_VIBE_RESULT'; result: VibeAnalysisResult }
  | { type: 'SET_USER_NAME'; name: string }
  | { type: 'SET_USER_PHONE'; phone: string }
  | { type: 'SET_SPECIALTY'; specialty: ExpertSpecialty }
  | { type: 'SET_REGION'; region: Region }
  | { type: 'SET_RADAR_ADDRESS'; address: string }
  | { type: 'SET_FIRST_DEAL_CARD_ID'; id: string }
  | { type: 'SET_SESSION_TOKEN'; token: string }
  | { type: 'LOAD_PERSISTED'; state: Omit<OnboardingState, 'data'> & { data: Omit<OnboardingData, 'photoFile'> } }
  | { type: 'RESET' };

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'SET_STAGE': {
      const now = new Date().toISOString();
      return {
        ...state,
        stage: action.stage,
        stageTimestamps: { ...state.stageTimestamps, [action.stage]: now },
      };
    }
    case 'SET_ROLE':
      return { ...state, data: { ...state.data, role: action.role } };

    case 'SET_PHOTO_FILE':
      return {
        ...state,
        data: {
          ...state.data,
          photoFile: action.file,
          photoPreviewUrl: action.previewUrl,
        },
      };

    case 'SET_PHOTO_UPLOADED_URL':
      return { ...state, data: { ...state.data, photoUploadedUrl: action.url } };

    case 'SET_VIBE_RESULT':
      return { ...state, data: { ...state.data, vibeResult: action.result } };

    case 'SET_USER_NAME':
      return { ...state, data: { ...state.data, userName: action.name } };

    case 'SET_USER_PHONE':
      return { ...state, data: { ...state.data, userPhone: action.phone } };

    case 'SET_SPECIALTY':
      return { ...state, data: { ...state.data, specialty: action.specialty } };

    case 'SET_REGION':
      return { ...state, data: { ...state.data, region: action.region } };

    case 'SET_RADAR_ADDRESS':
      return { ...state, data: { ...state.data, radarAddress: action.address } };

    case 'SET_FIRST_DEAL_CARD_ID':
      return { ...state, data: { ...state.data, firstDealCardId: action.id } };

    case 'SET_SESSION_TOKEN':
      return { ...state, data: { ...state.data, sessionToken: action.token } };

    case 'LOAD_PERSISTED': {
      // Rehydrate from localStorage — File objects cannot be persisted
      const { data: persistedData, ...rest } = action.state;
      return {
        ...rest,
        data: {
          ...persistedData,
          photoFile: null, // File objects cannot be serialized
        },
      };
    }

    case 'RESET':
      return { ...INITIAL_STATE, stageTimestamps: {} };

    default:
      return state;
  }
}

// ── Serialisable snapshot (excludes File) ────────────────────────────────────

type PersistedState = Omit<OnboardingState, 'data'> & {
  data: Omit<OnboardingData, 'photoFile'>;
};

function toPersistedState(state: OnboardingState): PersistedState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { photoFile: _file, ...dataWithoutFile } = state.data;
  return { ...state, data: dataWithoutFile };
}

function loadPersistedState(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function savePersistedState(state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(state)));
  } catch {
    // Ignore quota / private-mode errors
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface OnboardingContextValue {
  state: OnboardingState;
  dispatch: Dispatch<OnboardingAction>;
  // Convenience setters
  setStage: (stage: OnboardingStage) => void;
  setRole: (role: UserRole) => void;
  setPhotoFile: (file: File, previewUrl: string) => void;
  setPhotoUploadedUrl: (url: string) => void;
  setVibeResult: (result: VibeAnalysisResult) => void;
  setUserName: (name: string) => void;
  setUserPhone: (phone: string) => void;
  setSpecialty: (specialty: ExpertSpecialty) => void;
  setRegion: (region: Region) => void;
  setRadarAddress: (address: string) => void;
  setFirstDealCardId: (id: string) => void;
  setSessionToken: (token: string) => void;
  reset: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Rehydrate from localStorage on first mount
  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      dispatch({ type: 'LOAD_PERSISTED', state: persisted });
    }
  }, []);

  // Persist to localStorage on every state change
  useEffect(() => {
    savePersistedState(state);
  }, [state]);

  // Convenience setters (stable references via useCallback)
  const setStage = useCallback((stage: OnboardingStage) => dispatch({ type: 'SET_STAGE', stage }), []);
  const setRole = useCallback((role: UserRole) => dispatch({ type: 'SET_ROLE', role }), []);
  const setPhotoFile = useCallback((file: File, previewUrl: string) => dispatch({ type: 'SET_PHOTO_FILE', file, previewUrl }), []);
  const setPhotoUploadedUrl = useCallback((url: string) => dispatch({ type: 'SET_PHOTO_UPLOADED_URL', url }), []);
  const setVibeResult = useCallback((result: VibeAnalysisResult) => dispatch({ type: 'SET_VIBE_RESULT', result }), []);
  const setUserName = useCallback((name: string) => dispatch({ type: 'SET_USER_NAME', name }), []);
  const setUserPhone = useCallback((phone: string) => dispatch({ type: 'SET_USER_PHONE', phone }), []);
  const setSpecialty = useCallback((specialty: ExpertSpecialty) => dispatch({ type: 'SET_SPECIALTY', specialty }), []);
  const setRegion = useCallback((region: Region) => dispatch({ type: 'SET_REGION', region }), []);
  const setRadarAddress = useCallback((address: string) => dispatch({ type: 'SET_RADAR_ADDRESS', address }), []);
  const setFirstDealCardId = useCallback((id: string) => dispatch({ type: 'SET_FIRST_DEAL_CARD_ID', id }), []);
  const setSessionToken = useCallback((token: string) => dispatch({ type: 'SET_SESSION_TOKEN', token }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      dispatch,
      setStage,
      setRole,
      setPhotoFile,
      setPhotoUploadedUrl,
      setVibeResult,
      setUserName,
      setUserPhone,
      setSpecialty,
      setRegion,
      setRadarAddress,
      setFirstDealCardId,
      setSessionToken,
      reset,
    }),
    [
      state,
      setStage,
      setRole,
      setPhotoFile,
      setPhotoUploadedUrl,
      setVibeResult,
      setUserName,
      setUserPhone,
      setSpecialty,
      setRegion,
      setRadarAddress,
      setFirstDealCardId,
      setSessionToken,
      reset,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within <OnboardingProvider>');
  }
  return ctx;
}
