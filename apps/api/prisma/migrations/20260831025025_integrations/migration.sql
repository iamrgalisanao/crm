-- CreateTable
CREATE TABLE "integration_channels" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "secret" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "external_id" TEXT,
    "from_name" TEXT,
    "from_handle" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'new',
    "linked_lead_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_channels_organization_id_idx" ON "integration_channels"("organization_id");

-- CreateIndex
CREATE INDEX "inbound_messages_organization_id_status_idx" ON "inbound_messages"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_messages_channel_id_external_id_key" ON "inbound_messages"("channel_id", "external_id");

-- AddForeignKey
ALTER TABLE "integration_channels" ADD CONSTRAINT "integration_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "integration_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
