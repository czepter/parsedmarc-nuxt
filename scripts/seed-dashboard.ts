/**
 * seed-dashboard.ts — inserts ~100k AggregateRecord rows for performance testing.
 * Run with: pnpm tsx scripts/seed-dashboard.ts
 */
import prisma from '../lib/prisma'

const RECORDS_TARGET = 100_000
const DISPOSITIONS = ['none', 'none', 'none', 'quarantine', 'reject'] as const
const DKIM_SPF = ['pass', 'pass', 'fail'] as const

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomIp(): string {
  return `${rand(1, 254)}.${rand(0, 255)}.${rand(0, 255)}.${rand(0, 255)}`
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function main() {
  console.log('Seeding dashboard data…')

  const domain = await prisma.domain.upsert({
    where: { name: 'seed-example.com' },
    create: { name: 'seed-example.com', addedAt: new Date() },
    update: {},
  })

  const inbox = await prisma.inbox.upsert({
    where: { id: 'seed-inbox-001' },
    create: {
      id: 'seed-inbox-001',
      label: 'Seed Inbox',
      host: 'imap.seed.test',
      port: 993,
      tls: true,
      username: 'seed@example.com',
      passwordEncrypted: 'seed-placeholder',
      enabled: false,
    },
    update: {},
  })

  const now = Date.now()
  const ninetyDaysMs = 90 * 24 * 3600 * 1000
  let inserted = 0

  while (inserted < RECORDS_TARGET) {
    const dateBegin = new Date(now - Math.random() * ninetyDaysMs)
    const dateEnd = new Date(dateBegin.getTime() + 3600 * 1000)
    const reportId = `seed-report-${Date.now()}-${Math.random().toString(36).slice(2)}`

    await prisma.aggregateReport.create({
      data: {
        reportId,
        orgName: 'seed-org',
        domainId: domain.id,
        dateBegin,
        dateEnd,
        inboxId: inbox.id,
        rawXml: '<feedback/>',
        records: {
          create: {
            sourceIp: randomIp(),
            count: rand(1, 200),
            disposition: pick(DISPOSITIONS),
            dkim: pick(DKIM_SPF),
            spf: pick(DKIM_SPF),
            headerFrom: 'seed-example.com',
          },
        },
      },
    })

    inserted++
    if (inserted % 1000 === 0) process.stdout.write(`\r  ${inserted}/${RECORDS_TARGET} records`)
  }

  console.log('\nSeed complete.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
