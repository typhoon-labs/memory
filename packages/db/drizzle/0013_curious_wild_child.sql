ALTER TABLE "documents" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
UPDATE "documents" SET "status" = 'error' WHERE "status" IN ('parse_error', 'embed_error');--> statement-breakpoint
DROP TYPE "public"."document_status";--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending', 'processing', 'ready', 'error', 'deleted');--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."document_status";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "status" SET DATA TYPE "public"."document_status" USING "status"::"public"."document_status";