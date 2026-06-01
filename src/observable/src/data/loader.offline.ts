import type { CombinedData, TemperatureData } from '../types'

declare const __COMBINED_DATA__: CombinedData
declare const __TEMPERATURE_DATA__: TemperatureData

export function loadCombinedData(): Promise<CombinedData> {
  return Promise.resolve(__COMBINED_DATA__)
}

export function loadTemperatureData(): Promise<TemperatureData> {
  return Promise.resolve(__TEMPERATURE_DATA__)
}
