/**
 * token.ts — 공유/열람 토큰 생성
 * Spec: DISTRIBUTION_AND_IDENTITY.md §2.2
 * 
 * 혼동 문자 제외 (0/O, 1/l/I) — 구두 전달·수기 입력 사고 방지
 * 순차·추측 가능한 토큰 금지. 열거 공격 방지.
 */
import { customAlphabet } from 'nanoid';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Share link token (24 chars, ~143 bit entropy) */
export const newShareToken = customAlphabet(ALPHABET, 24);

/** Grant pass token (28 chars, ~167 bit entropy) */
export const newGrantToken = customAlphabet(ALPHABET, 28);
