ALTER TABLE "messages" ALTER COLUMN "resource_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "resource_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_external_id_unique" UNIQUE("external_id");--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_external_id_unique" UNIQUE("external_id");