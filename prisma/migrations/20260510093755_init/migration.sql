-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramUserId" TEXT NOT NULL,
    "executionInterval" TEXT NOT NULL DEFAULT 'H1',
    "assets" TEXT NOT NULL DEFAULT '["BTCUSDT"]',
    "signalThreshold" INTEGER NOT NULL DEFAULT 60,
    "polymarketSearchQuery" TEXT,
    "baseBetUsdc" TEXT NOT NULL DEFAULT '10',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TradeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userPreferenceId" TEXT,
    "signal" TEXT NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "tokenId" TEXT,
    "side" TEXT,
    "size" TEXT,
    "orderId" TEXT,
    "txHash" TEXT,
    "polymarketUrl" TEXT,
    "error" TEXT,
    "escgo" TEXT,
    "stochK" TEXT,
    "stochD" TEXT,
    "conf" TEXT,
    "conditionId" TEXT,
    "asset" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeLog_userPreferenceId_fkey" FOREIGN KEY ("userPreferenceId") REFERENCES "UserPreference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_telegramUserId_key" ON "UserPreference"("telegramUserId");
