-- CreateTable
CREATE TABLE "DmarcLookup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "record" TEXT,
    "policy" TEXT,
    "subdomainPolicy" TEXT,
    "pct" INTEGER,
    "rua" TEXT,
    "ruf" TEXT,
    "aspf" TEXT,
    "adkim" TEXT,
    "fo" TEXT,
    "error" TEXT,
    "lookedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SpfLookup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "record" TEXT,
    "mechanisms" TEXT,
    "qualifierAll" TEXT,
    "includeCount" INTEGER,
    "error" TEXT,
    "lookedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DkimLookup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "record" TEXT,
    "keyType" TEXT,
    "publicKey" TEXT,
    "hasKey" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "lookedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MxLookup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "records" TEXT,
    "error" TEXT,
    "lookedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DmarcLookup_domain_key" ON "DmarcLookup"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SpfLookup_domain_key" ON "SpfLookup"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "DkimLookup_domain_selector_key" ON "DkimLookup"("domain", "selector");

-- CreateIndex
CREATE UNIQUE INDEX "MxLookup_domain_key" ON "MxLookup"("domain");
