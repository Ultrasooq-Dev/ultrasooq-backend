-- CreateTable
CREATE TABLE "support_conversation" (
    "id" SERIAL NOT NULL,
    "contactId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'bot',
    "channel" TEXT NOT NULL DEFAULT 'web_widget',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "topic" TEXT,
    "metadata" JSONB,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "csatRating" INTEGER,
    "csatComment" TEXT,
    "botMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "humanMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "support_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_message" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" INTEGER,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "feedbackScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_event" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_learning" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "topic" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "thumbsUp" INTEGER NOT NULL DEFAULT 0,
    "thumbsDown" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'admin_escalation',
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_base" (
    "id" SERIAL NOT NULL,
    "shortCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_response" (
    "id" SERIAL NOT NULL,
    "shortCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_response_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_conversation_contactId_status_idx" ON "support_conversation"("contactId", "status");

-- CreateIndex
CREATE INDEX "support_conversation_assigneeId_status_idx" ON "support_conversation"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "support_conversation_status_createdAt_idx" ON "support_conversation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "support_conversation_topic_idx" ON "support_conversation"("topic");

-- CreateIndex
CREATE INDEX "support_conversation_priority_status_idx" ON "support_conversation"("priority", "status");

-- CreateIndex
CREATE INDEX "support_message_conversationId_createdAt_idx" ON "support_message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "support_message_senderType_idx" ON "support_message"("senderType");

-- CreateIndex
CREATE INDEX "support_event_conversationId_idx" ON "support_event"("conversationId");

-- CreateIndex
CREATE INDEX "support_event_eventType_createdAt_idx" ON "support_event"("eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bot_learning_questionHash_key" ON "bot_learning"("questionHash");

-- CreateIndex
CREATE INDEX "bot_learning_status_confidence_idx" ON "bot_learning"("status", "confidence");

-- CreateIndex
CREATE INDEX "bot_learning_topic_idx" ON "bot_learning"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_base_shortCode_key" ON "knowledge_base"("shortCode");

-- CreateIndex
CREATE INDEX "knowledge_base_category_locale_status_idx" ON "knowledge_base"("category", "locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "canned_response_shortCode_key" ON "canned_response"("shortCode");

-- AddForeignKey
ALTER TABLE "support_conversation" ADD CONSTRAINT "support_conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_conversation" ADD CONSTRAINT "support_conversation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_message" ADD CONSTRAINT "support_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_event" ADD CONSTRAINT "support_event_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "support_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
