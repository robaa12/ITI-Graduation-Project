CREATE TABLE "product_asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_asset_objectKey_key" ON "product_asset"("objectKey");
CREATE INDEX "product_asset_projectId_createdAt_idx" ON "product_asset"("projectId", "createdAt");
ALTER TABLE "product_asset" ADD CONSTRAINT "product_asset_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
