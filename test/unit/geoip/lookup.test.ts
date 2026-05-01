import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted — these mocks are applied before the imports below
vi.mock('../../../lib/prisma', () => ({
  default: {
    geoLocation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

vi.mock('../../../lib/geoip/reader', () => ({
  getGeoReader: vi.fn(),
}))

import { lookupIp } from '../../../lib/geoip/lookup'
import prisma from '../../../lib/prisma'
import { getGeoReader } from '../../../lib/geoip/reader'

const mockFindUnique = vi.mocked(prisma.geoLocation.findUnique)
const mockUpsert = vi.mocked(prisma.geoLocation.upsert)
const mockGetReader = vi.mocked(getGeoReader)

describe('lookupIp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached result from DB on cache hit', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'geo1',
      ip: '8.8.8.8',
      country: 'US',
      city: 'Mountain View',
      latitude: 37.4,
      longitude: -122.1,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('8.8.8.8')

    expect(result).toEqual({ country: 'US', city: 'Mountain View', lat: 37.4, lon: -122.1 })
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { ip: '8.8.8.8' } })
    // Reader must not be touched on a cache hit
    expect(mockGetReader).not.toHaveBeenCalled()
  })

  it('returns null when Reader is not loaded (MMDB unavailable)', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockGetReader.mockReturnValueOnce(null)

    const result = await lookupIp('8.8.8.8')

    expect(result).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('queries Reader, stores result, and returns it on cache miss', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeReader = {
      get: vi.fn().mockReturnValue({
        country: { iso_code: 'DE' },
        city: { names: { en: 'Berlin' } },
        location: { latitude: 52.52, longitude: 13.4 },
      }),
    } as any
    mockGetReader.mockReturnValueOnce(fakeReader)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo2',
      ip: '1.2.3.4',
      country: 'DE',
      city: 'Berlin',
      latitude: 52.52,
      longitude: 13.4,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('1.2.3.4')

    expect(fakeReader.get).toHaveBeenCalledWith('1.2.3.4')
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '1.2.3.4' },
      create: { ip: '1.2.3.4', country: 'DE', city: 'Berlin', latitude: 52.52, longitude: 13.4 },
      update: { country: 'DE', city: 'Berlin', latitude: 52.52, longitude: 13.4, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: 'DE', city: 'Berlin', lat: 52.52, lon: 13.4 })
  })

  it('returns null when IP is not found in the Reader', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeReader = { get: vi.fn().mockReturnValue(undefined) } as any
    mockGetReader.mockReturnValueOnce(fakeReader)

    const result = await lookupIp('192.168.1.1')

    expect(result).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns partial result when Reader response is missing optional fields', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeReader = {
      get: vi.fn().mockReturnValue({
        country: { iso_code: 'US' },
        // city and location intentionally omitted — real MaxMind may omit these
      }),
    } as any
    mockGetReader.mockReturnValueOnce(fakeReader)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo3',
      ip: '1.1.1.1',
      country: 'US',
      city: null,
      latitude: null,
      longitude: null,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('1.1.1.1')

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '1.1.1.1' },
      create: { ip: '1.1.1.1', country: 'US', city: null, latitude: null, longitude: null },
      update: { country: 'US', city: null, latitude: null, longitude: null, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: 'US', city: null, lat: null, lon: null })
  })

  it('returns null for optional fields when Reader omits them entirely', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeReader = {
      get: vi.fn().mockReturnValue({
        country: {},
        // all optional fields entirely missing
      }),
    } as any
    mockGetReader.mockReturnValueOnce(fakeReader)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo4',
      ip: '2.2.2.2',
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('2.2.2.2')

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '2.2.2.2' },
      create: { ip: '2.2.2.2', country: null, city: null, latitude: null, longitude: null },
      update: { country: null, city: null, latitude: null, longitude: null, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: null, city: null, lat: null, lon: null })
  })
})
