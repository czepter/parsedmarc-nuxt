-- AlterTable
ALTER TABLE "AggregateRecord" ADD COLUMN "dkimAuthDomain" TEXT;
ALTER TABLE "AggregateRecord" ADD COLUMN "dkimAuthResult" TEXT;
ALTER TABLE "AggregateRecord" ADD COLUMN "dkimAuthSelector" TEXT;
ALTER TABLE "AggregateRecord" ADD COLUMN "spfAuthDomain" TEXT;
ALTER TABLE "AggregateRecord" ADD COLUMN "spfAuthResult" TEXT;

-- AlterTable
ALTER TABLE "AggregateReport" ADD COLUMN "policyAdkim" TEXT;
ALTER TABLE "AggregateReport" ADD COLUMN "policyAspf" TEXT;
ALTER TABLE "AggregateReport" ADD COLUMN "policyP" TEXT;
ALTER TABLE "AggregateReport" ADD COLUMN "policyPct" INTEGER;
ALTER TABLE "AggregateReport" ADD COLUMN "policySp" TEXT;
