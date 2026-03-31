ALTER TABLE "sync_targets" ADD COLUMN "managed_by" text;--> statement-breakpoint
ALTER TABLE "sync_targets" ADD COLUMN "source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_targets_name_managed_by_idx" ON "sync_targets" USING btree ("name",COALESCE("managed_by", 'manual'));
