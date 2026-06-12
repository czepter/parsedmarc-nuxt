import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    prisma: {
      domain: { findUnique: vi.fn() },
      aggregateRecord: { findFirst: vi.fn() },
      dmarcLookup: { findUnique: vi.fn() },
      aggregateReport: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
    },
    getEmailAuth: vi.fn(),
    findInheritedDmarc: vi.fn(),
  }
})

vi.mock('~~/lib/prisma', () => ({
  default: mocks.prisma,
}))

vi.mock('../../../app/server/utils/dns-lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../app/server/utils/dns-lookup')>()
  return {
    ...actual,
    getEmailAuth: mocks.getEmailAuth,
    findInheritedDmarc: mocks.findInheritedDmarc,
  }
})

describe('domain drift endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    Object.assign(globalThis, {
      defineEventHandler: (handler: unknown) => handler,
      getRouterParams: () => ({ name: '50mm-freunde.de' }),
      createError: ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => {
        const error = new Error(statusMessage) as Error & { statusCode: number; statusMessage: string }
        error.statusCode = statusCode
        error.statusMessage = statusMessage
        return error
      },
    })
  })

  it('uses the refreshed DMARC lookup for drift classification', async () => {
    mocks.prisma.domain.findUnique.mockResolvedValue({ id: 'domain-1' })
    mocks.prisma.dmarcLookup.findUnique.mockResolvedValue({
      record: null,
      policy: null,
      error: 'NORECORD',
    })
    mocks.prisma.aggregateReport.findFirst.mockResolvedValue({ policyP: 'reject' })
    mocks.prisma.$queryRaw.mockResolvedValue([{ disposition: 'reject', total: 31 }])
    mocks.getEmailAuth.mockResolvedValue({
      dmarc: {
        record: 'v=DMARC1; p=reject; rua=mailto:dmarc@50mm-freunde.de',
        policy: 'reject',
        error: null,
      },
    })
    mocks.findInheritedDmarc.mockResolvedValue(null)

    const handler = (await import('../../../app/server/api/domains/[name]/drift.get')).default

    const result = await handler({} as never)

    expect(mocks.getEmailAuth).toHaveBeenCalledWith('50mm-freunde.de')
    expect(result.kind).toBe('aligned')
    expect(result.dnsPolicy).toBe('reject')
  })
})
