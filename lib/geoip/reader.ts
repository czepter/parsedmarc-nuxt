import type { Reader, CityResponse } from 'maxmind'

let _reader: Reader<CityResponse> | null = null

export function getGeoReader(): Reader<CityResponse> | null {
  return _reader
}

export function setGeoReader(reader: Reader<CityResponse>): void {
  _reader = reader
}
