-- Rename S3-specific column names to source-agnostic names
ALTER TABLE "documents" RENAME COLUMN "s3_key" TO "source_key";
ALTER TABLE "documents" RENAME COLUMN "s3_etag" TO "source_etag";
