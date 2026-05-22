# AWS Bedrock Integration

This guide covers deploying Typhoon with direct AWS Bedrock access on EKS, using IRSA (IAM Roles for Service Accounts) for credential management.

## Overview

In local development, LLM calls route through Bifrost (an OpenAI-compatible gateway proxy). In production on AWS, the app connects directly to Bedrock using the native AWS SDK. The provider is selected automatically based on environment variables:

- **`LLM_BASE_URL` set** -- gateway mode (Bifrost/dev)
- **`LLM_BASE_URL` unset** -- direct Bedrock mode (production)

Same pattern for embeddings (`EMBEDDING_BASE_URL`) and reranking (`RERANKER_BASE_URL`).

## Prerequisites

- EKS cluster with OIDC provider enabled:
  ```bash
  eksctl utils associate-iam-oidc-provider --cluster typhoon --approve
  ```
- Bedrock model access enabled in the target region(s) via the AWS Console (Bedrock > Model access)
- If using cross-region inference: confirm system-defined inference profiles are available in your region

## IAM Policy

Create an IAM policy granting Bedrock and S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:GetInferenceProfile"],
      "Resource": ["arn:aws:bedrock:*::foundation-model/*", "arn:aws:bedrock:*:ACCOUNT:inference-profile/*"]
    },
    {
      "Sid": "BedrockRerank",
      "Effect": "Allow",
      "Action": "bedrock:Rerank",
      "Resource": "arn:aws:bedrock:*::foundation-model/cohere.rerank-v3-5:0"
    },
    {
      "Sid": "S3Documents",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:CopyObject"],
      "Resource": ["arn:aws:s3:::typhoon-documents", "arn:aws:s3:::typhoon-documents/*"]
    }
  ]
}
```

Replace `ACCOUNT` with your AWS account ID and `typhoon-documents` with your bucket name.

## IAM Role + Trust Policy

Create an IAM role that EKS pods can assume via IRSA:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/oidc.eks.REGION.amazonaws.com/id/CLUSTER_ID"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.REGION.amazonaws.com/id/CLUSTER_ID:sub": "system:serviceaccount:typhoon:typhoon-app",
          "oidc.eks.REGION.amazonaws.com/id/CLUSTER_ID:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

Replace `ACCOUNT`, `REGION`, and `CLUSTER_ID` with your values.

## K8s ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: typhoon-app
  namespace: typhoon
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/typhoon-bedrock
```

All pods (api, worker, scheduler) should use this ServiceAccount. EKS automatically injects:

| Environment Variable          | Description                 |
| ----------------------------- | --------------------------- |
| `AWS_WEB_IDENTITY_TOKEN_FILE` | Path to the OIDC token file |
| `AWS_ROLE_ARN`                | The IAM role ARN to assume  |
| `AWS_STS_REGIONAL_ENDPOINTS`  | Set to `regional` by EKS    |

The AWS SDK's `fromNodeProviderChain()` detects these and uses `sts:AssumeRoleWithWebIdentity` automatically, with built-in token refresh. No manual credential rotation is needed.

## Bedrock Inference Profiles

Inference profiles are available for **text generation models only**. Embedding models and reranker models do **not** support inference profiles (confirmed by AWS: "some models, such as embedding models, do not support inference profiles").

### Which model types support inference profiles?

| Model Type        | Inference Profiles | How to Reference                                        |
| ----------------- | ------------------ | ------------------------------------------------------- |
| Chat / text gen   | Yes                | Profile ID or ARN                                       |
| Embedding (Titan) | **No**             | Standard model ID (e.g. `amazon.titan-embed-text-v2:0`) |
| Reranker (Cohere) | **No**             | Foundation model ARN                                    |

### System-Defined (Cross-Region)

AWS-managed profiles that automatically route requests across regions. Two scopes are available:

- **Geo** (`us.` / `eu.` / `au.` / `jp.`) -- routes within a geographic area
- **Global** (`global.`) -- routes across all supported regions worldwide

#### Geo Profiles (Recommended)

| Profile ID                                    | Model             | Routes Across |
| --------------------------------------------- | ----------------- | ------------- |
| `us.anthropic.claude-sonnet-4-6`              | Claude Sonnet 4.6 | US regions    |
| `eu.anthropic.claude-sonnet-4-6`              | Claude Sonnet 4.6 | EU regions    |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | Claude Haiku 4.5  | US regions    |

#### Global Profiles

| Profile ID                                        | Model             | Routes Across |
| ------------------------------------------------- | ----------------- | ------------- |
| `global.anthropic.claude-sonnet-4-6`              | Claude Sonnet 4.6 | All regions   |
| `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Claude Haiku 4.5  | All regions   |

Use the profile ID directly as the model ID in environment variables:

```bash
LLM_CHAT_MODEL=us.anthropic.claude-sonnet-4-6
```

**Recommended for production** -- geo profiles provide automatic failover and higher aggregate throughput while keeping data within your geography. Use global profiles when there are no data residency constraints.

> Verify available profiles in your region:
>
> ```bash
> aws bedrock list-inference-profiles --region us-east-1 \
>   --query 'inferenceProfileSummaries[].{id:inferenceProfileId, name:inferenceProfileName, type:type}'
> ```

### Application Inference Profiles

User-created profiles for cost tracking and tagging. Reference by full ARN:

```bash
LLM_CHAT_MODEL=arn:aws:bedrock:us-east-1:123456789012:inference-profile/my-typhoon-profile
```

To create one:

```bash
aws bedrock create-inference-profile \
  --inference-profile-name typhoon-chat \
  --model-source '{"copyFrom":"arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6"}' \
  --tags Key=project,Value=typhoon
```

Use application profiles when you need cost attribution per environment or team.

## Model IDs

### Chat Models

| Environment Variable            | Example Value                                 |
| ------------------------------- | --------------------------------------------- |
| `LLM_CHAT_MODEL`                | `us.anthropic.claude-sonnet-4-6`              |
| `LLM_TITLE_MODEL`               | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `LLM_GUARDRAIL_MODEL`           | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `LLM_METADATA_EXTRACTION_MODEL` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `LLM_SCORING_MODEL`             | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| `LLM_KNOWLEDGE_MODEL`           | `us.anthropic.claude-sonnet-4-6`              |

#### OpenAI GPT-OSS Models

OpenAI's open-source models are available on Bedrock via the Invoke and Converse APIs. **Cross-region inference profiles are not available** for these models -- they are in-region only.

| Model        | Model ID (bedrock-runtime) | Model ID (bedrock-mantle) |
| ------------ | -------------------------- | ------------------------- |
| GPT-OSS 20B  | `openai.gpt-oss-20b-1:0`   | `openai.gpt-oss-20b`      |
| GPT-OSS 120B | `openai.gpt-oss-120b-1:0`  | `openai.gpt-oss-120b`     |

Example -- use GPT-OSS 120B for scoring:

```bash
LLM_SCORING_MODEL=openai.gpt-oss-120b-1:0
```

> Available in us-east-1, us-east-2, us-west-2, and select EU/AP regions. Verify model access is enabled via the Bedrock console.

### Embedding Models (No Inference Profiles)

Embedding models do not support inference profiles. Use standard model IDs:

```bash
EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
```

These are called via the `InvokeModel` API and are only available in regions where the model is deployed. There is no cross-region routing.

### Reranker (No Inference Profiles)

Reranker models do not support inference profiles. Use the full foundation model ARN:

```bash
RERANKER_MODEL=arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0
```

The Bedrock Rerank API is a separate endpoint from `InvokeModel` and does not participate in the inference profile routing system.

## Production Environment Variables

Minimal `.env` for direct Bedrock mode (no gateway):

```bash
# AWS (set by IRSA -- only set manually for local testing)
AWS_REGION=us-east-1

# Data stores
DATABASE_URL=postgresql://user:pass@your-pg-host:5432/typhoon
REDIS_URL=redis://your-redis-host:6379

# S3 -- no S3_ACCESS_KEY/S3_SECRET_KEY needed (IRSA handles credentials)
S3_REGION=us-east-1
S3_BUCKET=typhoon-documents
S3_FORCE_PATH_STYLE=false

# LLM -- no LLM_BASE_URL or LLM_API_KEY needed
LLM_CHAT_MODEL=us.anthropic.claude-sonnet-4-6
LLM_TITLE_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_GUARDRAIL_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_METADATA_EXTRACTION_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
LLM_SCORING_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0

# Embeddings -- no EMBEDDING_BASE_URL needed
EMBEDDING_MODEL=amazon.titan-embed-text-v2:0
EMBEDDING_DIMENSION=1024

# Reranker -- no RERANKER_BASE_URL needed
RERANKER_MODEL=arn:aws:bedrock:us-east-1::foundation-model/cohere.rerank-v3-5:0

# Auth
AUTH_SECRET=your-strong-random-secret
AUTH_URL=https://api.typhoon.example.com
TRUSTED_ORIGINS=https://desk.typhoon.example.com,https://admin.typhoon.example.com

# OIDC
OIDC_ISSUER_URL=https://your-org.okta.com
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...

# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.your-provider.com:4318
```

## Verifying IRSA

From inside a pod:

```bash
# Check injected env vars
env | grep AWS_

# Test Bedrock access
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?modelId==`anthropic.claude-sonnet-4-6`]'

# Test S3 access
aws s3 ls s3://typhoon-documents/
```

## How It Works (Code)

The provider selection lives in `packages/ai/src/index.ts`:

- `createChatModel()` / `createEmbeddingModel()` -- checks for `LLM_BASE_URL` / `EMBEDDING_BASE_URL`. If set, uses `@ai-sdk/openai-compatible` (gateway). If not, uses `@ai-sdk/amazon-bedrock` with `fromNodeProviderChain()` for credentials.
- `createRerankerScorer()` -- checks for `RERANKER_BASE_URL`. If set, uses the Cohere-compatible HTTP `RerankerScorer`. If not, uses `BedrockRerankerScorer` which calls the Bedrock Rerank API via `@aws-sdk/client-bedrock-agent-runtime`.
- S3 blob store (`packages/blob-store/src/adapters/s3.ts`) -- when `S3_ACCESS_KEY` / `S3_SECRET_KEY` are omitted, the AWS SDK uses the default credential chain (IRSA).

All downstream model factories (`createTitleModel`, `createGuardrailModel`, `createScoringModel`, etc.) delegate to `createChatModel` and inherit the provider selection automatically.
