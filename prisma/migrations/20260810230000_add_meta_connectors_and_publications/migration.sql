-- CreateEnum
CREATE TYPE "SocialConnectionProvider" AS ENUM ('META');

-- CreateEnum
CREATE TYPE "SocialConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "SocialPublicationStatus" AS ENUM ('QUEUED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "social_connection" (
    "id" TEXT NOT NULL,
    "provider" "SocialConnectionProvider" NOT NULL,
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalUserId" TEXT,
    "accessTokenCiphertext" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "social_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_account" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "imageUrl" TEXT,
    "tasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenCiphertext" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "connectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "social_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_oauth_state" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meta_oauth_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_publication" (
    "id" TEXT NOT NULL,
    "status" "SocialPublicationStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "caption" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "accountName" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "error" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "contentId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "social_publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_connection_userId_provider_key" ON "social_connection"("userId", "provider");
CREATE INDEX "social_connection_userId_status_idx" ON "social_connection"("userId", "status");
CREATE UNIQUE INDEX "social_account_connectionId_platform_externalId_key" ON "social_account"("connectionId", "platform", "externalId");
CREATE INDEX "social_account_connectionId_selected_idx" ON "social_account"("connectionId", "selected");
CREATE UNIQUE INDEX "meta_oauth_state_stateHash_key" ON "meta_oauth_state"("stateHash");
CREATE INDEX "meta_oauth_state_userId_idx" ON "meta_oauth_state"("userId");
CREATE INDEX "meta_oauth_state_expiresAt_idx" ON "meta_oauth_state"("expiresAt");
CREATE INDEX "social_publication_contentId_idx" ON "social_publication"("contentId");
CREATE INDEX "social_publication_socialAccountId_status_idx" ON "social_publication"("socialAccountId", "status");
CREATE INDEX "social_publication_status_scheduledFor_idx" ON "social_publication"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "social_connection" ADD CONSTRAINT "social_connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "social_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meta_oauth_state" ADD CONSTRAINT "meta_oauth_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_publication" ADD CONSTRAINT "social_publication_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "generated_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_publication" ADD CONSTRAINT "social_publication_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "social_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
