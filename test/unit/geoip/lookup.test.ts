import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddressNotFoundError } from '@maxmind/geoip2-node'

// vi.mock is hoisted — these mocks are applied before the imports below
vi.mock('../../../lib/prisma', () => ({
  default: {
    geoLocation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

vi.mock('../../../lib/geoip/client', () => ({
  getGeoClient: vi.fn(),
}))

import { lookupIp } from '../../../lib/geoip/lookup'
import prisma from '../../../lib/prisma'
import { getGeoClient } from '../../../lib/geoip/client'

const mockFindUnique = vi.mocked(prisma.geoLocation.findUnique)
const mockUpsert = vi.mocked(prisma.geoLocation.upsert)
const mockGetClient = vi.mocked(getGeoClient)

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
    // Client must not be touched on a cache hit
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  it('returns null when client is not configured (creds unset)', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockGetClient.mockReturnValueOnce(null)

    const result = await lookupIp('8.8.8.8')

    expect(result).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('queries client, stores result, and returns it on cache miss', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockResolvedValue({
        country: { isoCode: 'DE' },
        city: { names: { en: 'Berlin' } },
        location: { latitude: 52.52, longitude: 13.4 },
      }),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
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

    expect(fakeClient.city).toHaveBeenCalledWith('1.2.3.4')
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '1.2.3.4' },
      create: { ip: '1.2.3.4', country: 'DE', city: 'Berlin', latitude: 52.52, longitude: 13.4 },
      update: { country: 'DE', city: 'Berlin', latitude: 52.52, longitude: 13.4, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: 'DE', city: 'Berlin', lat: 52.52, lon: 13.4 })
  })

  it('caches negative result on AddressNotFoundError', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockRejectedValue(new AddressNotFoundError('IP address not found')),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo-neg',
      ip: '192.168.1.1',
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('192.168.1.1')

    expect(fakeClient.city).toHaveBeenCalledWith('192.168.1.1')
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '192.168.1.1' },
      create: { ip: '192.168.1.1', country: null, city: null, latitude: null, longitude: null },
      update: { country: null, city: null, latitude: null, longitude: null, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: null, city: null, lat: null, lon: null })
  })

  it('does not cache transient errors', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)

    const result = await lookupIp('1.2.3.4')

    expect(result).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns partial result when client response is missing optional fields', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockResolvedValue({
        country: { isoCode: 'US' },
        // city and location intentionally omitted — real MaxMind may omit these
      }),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
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

  it('returns null fields when client response omits everything', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockResolvedValue({ country: {} }),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
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
