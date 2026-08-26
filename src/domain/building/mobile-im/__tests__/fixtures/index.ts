export * from './yangpyeong';
export * from './dangsan';
export * from './jamwon';
export * from './sutaek';
export * from './hotel';
export * from './multiparcel';
export * from './ownocc';
export * from './trading';

import { YANGPYEONG_FIXTURE } from './yangpyeong';
import { DANGSAN_FIXTURE } from './dangsan';
import { JAMWON_FIXTURE } from './jamwon';
import { SUTAEK_FIXTURE } from './sutaek';
import { HOTEL_FIXTURE } from './hotel';
import { MULTIPARCEL_FIXTURE } from './multiparcel';
import { OWNOCC_FIXTURE } from './ownocc';
import { TRADING_FIXTURE } from './trading';

export const ALL_FIXTURES = {
  yangpyeong: YANGPYEONG_FIXTURE,
  dangsan: DANGSAN_FIXTURE,
  jamwon: JAMWON_FIXTURE,
  sutaek: SUTAEK_FIXTURE,
  hotel: HOTEL_FIXTURE,
  multiparcel: MULTIPARCEL_FIXTURE,
  ownocc: OWNOCC_FIXTURE,
  trading: TRADING_FIXTURE,
};

export function loadFixture(name: keyof typeof ALL_FIXTURES) {
  return ALL_FIXTURES[name];
}
