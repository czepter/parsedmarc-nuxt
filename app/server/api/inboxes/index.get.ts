import prisma from '~~/lib/prisma'

const INBOX_SELECT = {
  id: true,
  label: true,
  host: true,
  port: true,
  tls: true,
  username: true,
  processedFolder: true,
  enabled: true,
  pollCron: true,
} as const

export default defineEventHandler(async () => {
  const [inboxes, statsByInbox, successByInbox] = await Promise.all([
    prisma.inbox.findMany({ select: INBOX_SELECT, orderBy: { label: 'asc' } }),
    prisma.scanRun.groupBy({
      by: ['inboxId'],
      _count: { _all: true },
      _sum: { messagesSeen: true },
    }),
    prisma.scanRun.groupBy({
      by: ['inboxId'],
      where: { errorMessage: null },
      _count: { _all: true },
    }),
  ])

  const latestRuns = await prisma.scanRun.findMany({
    where: { inboxId: { in: inboxes.map(i => i.id) } },
    orderBy: { startedAt: 'desc' },
    distinct: ['inboxId'],
    select: { inboxId: true, startedAt: true, errorMessage: true },
  })

  const totals = new Map(statsByInbox.map(s => [s.inboxId, s]))
  const successes = new Map(successByInbox.map(s => [s.inboxId, s._count._all]))
  const lasts = new Map(latestRuns.map(r => [r.inboxId, r]))

  return inboxes.map((i) => {
    const t = totals.get(i.id)
    const totalRuns = t?._count._all ?? 0
    const successCount = successes.get(i.id) ?? 0
    const last = lasts.get(i.id)
    return {
      ...i,
      totalRuns,
      messagesSeen: t?._sum.messagesSeen ?? 0,
      lastRunAt: last?.startedAt ?? null,
      lastRunOk: last ? last.errorMessage === null : null,
      successRate: totalRuns > 0 ? successCount / totalRuns : null,
    }
  })
})
