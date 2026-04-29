-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 993,
    "tls" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "processedFolder" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pollCron" TEXT NOT NULL DEFAULT '*/15 * * * *'
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AggregateReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "dateBegin" DATETIME NOT NULL,
    "dateEnd" DATETIME NOT NULL,
    "inboxId" TEXT NOT NULL,
    "rawXml" TEXT NOT NULL,
    CONSTRAINT "AggregateReport_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AggregateReport_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AggregateRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "sourceIp" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "dkim" TEXT NOT NULL,
    "spf" TEXT NOT NULL,
    "headerFrom" TEXT NOT NULL,
    "geoLocationId" TEXT,
    CONSTRAINT "AggregateRecord_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AggregateReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AggregateRecord_geoLocationId_fkey" FOREIGN KEY ("geoLocationId") REFERENCES "GeoLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForensicReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "arrivalDate" DATETIME NOT NULL,
    "sourceIp" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "rawEml" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    CONSTRAINT "ForensicReport_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ForensicReport_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeoLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "lookedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inboxId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "messagesSeen" INTEGER NOT NULL DEFAULT 0,
    "reportsParsed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "ScanRun_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_name_key" ON "Domain"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AggregateReport_reportId_key" ON "AggregateReport"("reportId");

-- CreateIndex
CREATE INDEX "AggregateReport_domainId_dateBegin_idx" ON "AggregateReport"("domainId", "dateBegin");

-- CreateIndex
CREATE INDEX "AggregateRecord_reportId_idx" ON "AggregateRecord"("reportId");

-- CreateIndex
CREATE INDEX "ForensicReport_domainId_idx" ON "ForensicReport"("domainId");

-- CreateIndex
CREATE INDEX "ForensicReport_inboxId_idx" ON "ForensicReport"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "GeoLocation_ip_key" ON "GeoLocation"("ip");

-- CreateIndex
CREATE INDEX "ScanRun_inboxId_idx" ON "ScanRun"("inboxId");
