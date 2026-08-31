-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "contact_person" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "source_id" UUID,
    "industry" TEXT,
    "interest" TEXT,
    "estimated_budget" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "location" TEXT,
    "assigned_user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'new',
    "score" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "next_followup_at" TIMESTAMP(3),
    "lost_reason" TEXT,
    "lost_notes" TEXT,
    "converted_account_id" UUID,
    "converted_contact_id" UUID,
    "converted_opportunity_id" UUID,
    "converted_at" TIMESTAMP(3),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_scores" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'custom',
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "total" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "scored_by" UUID,
    "scored_by_ai" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_sources_organization_id_idx" ON "lead_sources"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_organization_id_key_key" ON "lead_sources"("organization_id", "key");

-- CreateIndex
CREATE INDEX "leads_organization_id_idx" ON "leads"("organization_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_status_idx" ON "leads"("organization_id", "status");

-- CreateIndex
CREATE INDEX "leads_organization_id_assigned_user_id_idx" ON "leads"("organization_id", "assigned_user_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_source_id_idx" ON "leads"("organization_id", "source_id");

-- CreateIndex
CREATE INDEX "leads_next_followup_at_idx" ON "leads"("next_followup_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_lead_no_key" ON "leads"("organization_id", "lead_no");

-- CreateIndex
CREATE INDEX "lead_scores_lead_id_idx" ON "lead_scores"("lead_id");

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
