-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyGid" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotFoundEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "deviceType" TEXT NOT NULL DEFAULT 'unknown',
    "hits" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "captureEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE INDEX "Redirect_shop_createdAt_idx" ON "Redirect"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_shop_path_key" ON "Redirect"("shop", "path");

-- CreateIndex
CREATE INDEX "NotFoundEvent_shop_status_lastSeenAt_idx" ON "NotFoundEvent"("shop", "status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotFoundEvent_shop_path_key" ON "NotFoundEvent"("shop", "path");
