-- CreateTable
CREATE TABLE "ai_insights" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "model" TEXT NOT NULL DEFAULT 'heuristic',
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_insights_organization_id_subject_type_subject_id_idx" ON "ai_insights"("organization_id", "subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
