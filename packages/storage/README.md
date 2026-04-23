# @typhoon/storage

S3/MinIO object storage abstraction. Wraps AWS SDK v3 with path-style URL support for MinIO compatibility.

## Exports

| Export | Description |
|--------|-------------|
| `createS3Client()` | Create an S3 client with path-style and region config |
| `listObjects()` | List all objects in a bucket |
| `listObjectsByPrefix()` | List objects under a prefix (with pagination) |
| `uploadObject()` | Upload an object with optional content type |
| `downloadObject()` | Download an object as a readable stream |
| `copyObject()` | Copy an object within a bucket |
| `deleteObject()` | Delete an object |
| `S3Object` / `ListPrefixResult` | Type definitions |

## Environment Variables

Configured via `@typhoon/config`:

| Variable | Description |
|----------|-------------|
| `S3_ENDPOINT` | S3/MinIO endpoint URL |
| `S3_REGION` | AWS region (default: `us-east-1`) |
| `S3_ACCESS_KEY` | Access key |
| `S3_SECRET_KEY` | Secret key |

## Dependencies

`@aws-sdk/client-s3`, `@typhoon/config`, `@typhoon/logger`
