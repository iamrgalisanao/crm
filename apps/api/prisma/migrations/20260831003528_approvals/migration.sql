-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "submitted_at" TIMESTAMP(3),
ADD COLUMN     "submitted_by" UUID;

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_amount" BIGINT NOT NULL DEFAULT 0,
    "max_amount" BIGINT,
    "required_roles" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "tier" INTEGER NOT NULL,
    "required_role" TEXT NOT NULL,
    "approver_id" UUID,
    "decision" TEXT NOT NULL DEFAULT 'pending',
    "comments" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_rules_organization_id_idx" ON "approval_rules"("organization_id");

-- CreateIndex
CREATE INDEX "quotation_approvals_quotation_id_idx" ON "quotation_approvals"("quotation_id");

-- AddForeignKey
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
