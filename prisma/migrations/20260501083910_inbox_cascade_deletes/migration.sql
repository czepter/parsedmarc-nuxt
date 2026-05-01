-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AggregateReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "dateBegin" DATETIME NOT NULL,
    "dateEnd" DATETIME NOT NULL,
    "inboxId" TEXT NOT NULL,
    "rawXml" TEXT NOT NULL,
    CONSTRAINT "AggregateReport_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AggregateReport_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AggregateReport" ("dateBegin", "dateEnd", "domainId", "id", "inboxId", "orgName", "rawXml", "reportId") SELECT "dateBegin", "dateEnd", "domainId", "id", "inboxId", "orgName", "rawXml", "reportId" FROM "AggregateReport";
DROP TABLE "AggregateReport";
ALTER TABLE "new_AggregateReport" RENAME TO "AggregateReport";
CREATE UNIQUE INDEX "AggregateReport_reportId_key" ON "AggregateReport"("reportId");
CREATE INDEX "AggregateReport_domainId_dateBegin_idx" ON "AggregateReport"("domainId", "dateBegin");
CREATE TABLE "new_ForensicReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "arrivalDate" DATETIME NOT NULL,
    "sourceIp" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawEml" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    CONSTRAINT "ForensicReport_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ForensicReport_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ForensicReport" ("arrivalDate", "domainId", "id", "inboxId", "rawEml", "sourceIp", "subject") SELECT "arrivalDate", "domainId", "id", "inboxId", "rawEml", "sourceIp", "subject" FROM "ForensicReport";
DROP TABLE "ForensicReport";
ALTER TABLE "new_ForensicReport" RENAME TO "ForensicReport";
CREATE INDEX "ForensicReport_domainId_idx" ON "ForensicReport"("domainId");
CREATE INDEX "ForensicReport_inboxId_idx" ON "ForensicReport"("inboxId");
CREATE TABLE "new_ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inboxId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "messagesSeen" INTEGER NOT NULL DEFAULT 0,
    "reportsParsed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "ScanRun_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScanRun" ("errorMessage", "finishedAt", "id", "inboxId", "messagesSeen", "reportsParsed", "startedAt") SELECT "errorMessage", "finishedAt", "id", "inboxId", "messagesSeen", "reportsParsed", "startedAt" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
CREATE INDEX "ScanRun_inboxId_idx" ON "ScanRun"("inboxId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
