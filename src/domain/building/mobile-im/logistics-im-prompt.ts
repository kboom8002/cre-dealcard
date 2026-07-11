/**
 * 물류센터 IM 생성 시 추가 프롬프트 세그먼트.
 * 일반 꼬마빌딩용 프롬프트에 물류센터 특화 분석 지시 사항을 추가합니다.
 */

export function getLogisticsPromptOverlay(logistics: Record<string, any>): string {
  return `
## [물류센터/창고 특화 분석 요구사항]

이 매물은 상업용 부동산 중 **물류센터/창고(Logistics Center / Warehouse)** 자산입니다. 
다음 스펙 데이터를 참고하여 일반 빌딩과 다르게 물류 및 유통 비즈니스 관점에서 각 섹션을 서술하십시오:

### 1. property_overview (물건 개요) 섹션 지시사항:
다음 물리적 스펙 정보를 테이블 또는 텍스트로 밀도 있게 포함시키십시오:
- 천장고(유효 층고): ${logistics.ceiling_height_m ? `${logistics.ceiling_height_m}m` : '미확인'}
- 도크(접안구) 수: ${logistics.dock_count ? `${logistics.dock_count}개` : '미확인'} (도크 레벨러: ${logistics.dock_leveler_count ? `${logistics.dock_leveler_count}개` : '미확인'})
- 접안 차량 규격: 최대 ${logistics.max_vehicle_ton ? `${logistics.max_vehicle_ton}톤 차량 접안 가능` : '미확인'}
- 바닥 하중: ${logistics.floor_load_ton_m2 ? `${logistics.floor_load_ton_m2}톤/㎡` : '미확인'}
- 기둥 간격: ${logistics.column_span_m ? `${logistics.column_span_m}` : '미확인'}
- 냉동/냉장 시설: ${logistics.cold_storage_type === 'none' || !logistics.cold_storage_type ? '없음(상온 전용)' : `${logistics.cold_storage_type} (${logistics.cold_storage_area_pyeong ?? '?'}평)`}
- 전기 용량: ${logistics.power_capacity_kw ? `${logistics.power_capacity_kw}kW` : '미확인'}

### 2. location_access (입지 및 접근성) 섹션 지시사항:
- 고속도로 IC 접근성: ${logistics.ic_name ? `${logistics.ic_name} IC에서 약 ${logistics.distance_to_ic_km ?? '?'}km 거리` : '인근 고속도로 IC 근접'}
- 차량 진입로: ${logistics.vehicle_access_type === 'ramp' ? '직접 램프(Ramp) 진입식' : logistics.vehicle_access_type === 'dock' ? '도크 접안식' : '램프 및 도크 겸용'}
- 대형 트레일러(40피트 컨테이너 등) 회전 반경 및 주차/야적 공간 여유를 설명하십시오.

### 3. investment_thesis (투자 포인트) 섹션 지시사항:
- 수도권/권역 물류 시장 동향 (최근 공실률 흐름 및 임대료 전망)
- 이커머스 풀필먼트(Fullfillment) 또는 3PL(제3자물류) 임차 수요와의 부합도 분석.
- 저온(냉동/냉장) 시설 보유 시, 상온 창고 대비 높은 임대료 프리미엄 및 가치 상승 가능성을 기술하십시오.

### 4. risk_check (위험요소 체크리스트) 섹션 지시사항:
- 물류창고업 등록 여부 및 인허가 제한 사항 검토.
- 화재 소방 설비 (스프링클러 ${logistics.sprinkler ? '설치 완료' : '설치 여부 확인 요망'}) 및 내화 등급 (${logistics.fire_rating ?? '일반'}).
- 냉동기 설비 노후화 리스크 및 전기 인입 한도 확인 필요성 기술.
`;
}
