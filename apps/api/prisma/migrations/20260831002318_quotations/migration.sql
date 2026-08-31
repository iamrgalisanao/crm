-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quote_no" TEXT NOT NULL,
    "account_id" UUID,
    "opportunity_id" UUID,
    "contact_id" UUID,
    "owner_id" UUID,
    "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiry_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "grand_total" BIGINT NOT NULL DEFAULT 0,
    "terms" TEXT,
    "payment_terms" TEXT,
    "delivery_terms" TEXT,
    "validity_days" INTEGER,
    "notes" TEXT,
    "approval_state" TEXT NOT NULL DEFAULT 'none',
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sales_order_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "product_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unit_price" BIGINT NOT NULL,
    "discount_type" TEXT NOT NULL DEFAULT 'none',
    "discount_value" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_id" UUID,
    "tax_rate_bp" INTEGER NOT NULL DEFAULT 0,
    "line_subtotal" BIGINT NOT NULL DEFAULT 0,
    "line_tax" BIGINT NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotations_organization_id_idx" ON "quotations"("organization_id");

-- CreateIndex
CREATE INDEX "quotations_organization_id_status_idx" ON "quotations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "quotations_opportunity_id_idx" ON "quotations"("opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_organization_id_quote_no_key" ON "quotations"("organization_id", "quote_no");

-- CreateIndex
CREATE INDEX "quotation_items_quotation_id_idx" ON "quotation_items"("quotation_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
