export interface IotSignal {
  hasIot: boolean
  dailyFootfall: number | null
  avgDwellMinutes: number | null
  energyEfficiency: number | null
  floorOccupancy: Record<string, number> | null
  lastSyncedAt: string | null
}

export function extractIotSignal(building: Record<string, unknown>): IotSignal {
  return {
    hasIot:            !!building.iot_device_id,
    dailyFootfall:     building.iot_daily_footfall as number | null,
    avgDwellMinutes:   building.iot_avg_dwell_minutes as number | null,
    energyEfficiency:  building.iot_energy_efficiency as number | null,
    floorOccupancy:    building.iot_floor_occupancy as Record<string, number> | null,
    lastSyncedAt:      building.iot_last_synced_at as string | null,
  }
}

// 레트로핏 추천 여부 판단
export function shouldRecommendRetrofit(
  building: Record<string, unknown>,
  reportSentCount: number,
): boolean {
  const builtYear = building.built_year as number | null
  const vacancySignal = building.vacancy_signal as string | null
  const age = builtYear ? new Date().getFullYear() - builtYear : 0

  return (
    reportSentCount >= 3 &&        // 신뢰 관계 형성 후
    !!vacancySignal &&             // 공실 존재
    age >= 10                      // 준공 10년 이상
  )
}
