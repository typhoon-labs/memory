# Annotations

## Overview

Annotations provide a human review layer that complements automated scoring. Administrators can annotate individual assistant messages with tags, severity ratings, and comments to capture qualitative issues that automated scorers may miss.

## Annotation Schema

Each annotation includes:

| Field      | Type     | Required    | Description                                  |
| ---------- | -------- | ----------- | -------------------------------------------- |
| `tags`     | string[] | Yes (min 1) | One or more issue tags from a predefined set |
| `severity` | enum     | No          | `minor`, `major`, or `critical`              |
| `comment`  | string   | No          | Free-text explanation of the issue           |

## Tags

Annotations use a fixed set of tags that categorize the type of issue:

| Tag                  | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| `wrong-answer`       | The answer is factually incorrect                                |
| `hallucination`      | The answer contains claims not supported by the source documents |
| `incomplete`         | The answer is missing important information                      |
| `wrong-source-cited` | The answer cites an incorrect or irrelevant source               |
| `tone-issue`         | The tone or phrasing is inappropriate for the context            |
| `correct`            | The answer is correct (positive annotation)                      |

Multiple tags can be applied to a single annotation. For example, an answer might be both `incomplete` and have a `tone-issue`.

## Severity Levels

| Level      | Description                                   |
| ---------- | --------------------------------------------- |
| `minor`    | Small issue, answer is still usable           |
| `major`    | Significant issue that affects answer quality |
| `critical` | Severe issue, answer is misleading or harmful |

Severity is optional. When omitted, the annotation records the tags and comment without a severity classification.

## Workflow

### Creating Annotations

1. An admin navigates to the review detail page for a conversation thread.
2. The message timeline shows all user and assistant messages.
3. The admin clicks on an assistant message to open the annotation panel.
4. Tags are selected, severity is optionally set, and a comment is added.
5. The annotation is saved via `POST /v1/admin/reviews/:threadId/messages/:messageId/annotate`.

### Updating Annotations

Annotations can be updated by the same user who created them:

- `PATCH /v1/admin/reviews/:threadId/messages/:messageId/annotate`

### Deleting Annotations

Annotations can be removed:

- `DELETE /v1/admin/reviews/:threadId/messages/:messageId/annotate`

## Annotation Status Tracking

Threads in the review list can be filtered by annotation status:

| Status        | Meaning                                         |
| ------------- | ----------------------------------------------- |
| `all`         | No filter -- show all threads                   |
| `annotated`   | Threads that have at least one human annotation |
| `unannotated` | Threads with no human annotations               |

This allows reviewers to focus on threads that have not yet been manually reviewed.

## Review Detail UI

The review detail page (`/admin/reviews/:threadId`) provides:

- **Message timeline** -- chronological view of all user and assistant messages in the thread
- **Annotation panel** -- create/edit/delete annotations on any assistant message
- **Score panel** -- automated scores for each assistant message (from the [review pipeline](./reviews.md))

Annotations and automated scores are displayed side by side, giving reviewers a complete picture of both human and machine assessment.

## Integration with Automated Scoring

Annotations complement automated scoring -- they do not replace it:

- Automated scores run on every message (subject to sampling rate) and provide quantitative metrics.
- Human annotations are selective and provide qualitative feedback on specific issues.
- Both are stored in the `scores` table (annotations use `scorer_id = 'human-review'`).
- The dashboard aggregates both annotation counts and automated score averages.

## API Endpoints

| Endpoint                                                   | Method | Auth  | Description                                      |
| ---------------------------------------------------------- | ------ | ----- | ------------------------------------------------ |
| `/v1/admin/reviews`                                        | GET    | Admin | List threads with annotation status filter       |
| `/v1/admin/reviews/:threadId`                              | GET    | Admin | Thread detail with messages, scores, annotations |
| `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | POST   | Admin | Create annotation                                |
| `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | PATCH  | Admin | Update annotation                                |
| `/v1/admin/reviews/:threadId/messages/:messageId/annotate` | DELETE | Admin | Delete annotation                                |

## Key Files

- `apps/api/src/routes/reviews.ts` -- annotation API routes and Zod schema
- `packages/db/src/repos/review.repo.ts` -- annotation persistence and query logic
