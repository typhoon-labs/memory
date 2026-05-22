# Metadata

Metadata endpoints manage field groups and templates that define the custom metadata schema for documents. Unlike other admin features, metadata endpoints only require `requireAuth` (not admin-only), making them accessible to all authenticated users.

**Auth:** Session cookie or `X-API-Key` header (all endpoints).

## Concepts

- **Field Groups** are reusable sets of metadata field definitions. For example, a "Region" field group might define `country` (string, required) and `state` (string, optional).
- **Templates** compose one or more field groups with optional custom fields into a complete metadata schema. Templates are assigned to sync targets and control what custom metadata fields are available on documents.
- **Effective Schema** is the merged result of all field groups plus custom fields in a template. Groups are applied in order; later groups and custom fields override earlier ones on name collision.

### Field Types

| Type       | Description         |
| ---------- | ------------------- |
| `string`   | Single string value |
| `number`   | Numeric value       |
| `boolean`  | True/false value    |
| `string[]` | Array of strings    |

### Field Definition

Each field in a group or template has this structure:

```json
{
  "type": "string",
  "required": false,
  "default": "general",
  "allowedValues": ["general", "support", "billing"],
  "description": "The department this document belongs to"
}
```

| Property         | Type    | Required | Description                                                                                               |
| ---------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `type`           | string  | Yes      | One of `string`, `number`, `boolean`, `string[]`.                                                         |
| `required`       | boolean | No       | Whether the field must be present on documents.                                                           |
| `default`        | any     | No       | Default value applied when field is missing.                                                              |
| `allowedValues`  | array   | No       | Restrict field to specific values.                                                                        |
| `description`    | string  | No       | Human-readable field description.                                                                         |
| `searchable`     | boolean | No       | When `true`, field values are included in full-text search via weighted tsvector.                          |
| `searchPriority` | string  | No       | Search weight tier: `critical` (A), `high` (B), `moderate` (C, default), `standard` (D). Only when searchable. |

Changing `searchable` or `searchPriority` marks affected documents as `searchMetaDirty`. Use the [Refresh Search Index](sync-targets.md#refresh-search-index) endpoint or trigger a sync to recompute search metadata.

---

## Field Groups

### List Field Groups

```
GET /v1/metadata-field-groups
```

Returns all metadata field groups.

#### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/metadata-field-groups
```

---

### Create Field Group

```
POST /v1/metadata-field-groups
```

Creates a new metadata field group.

#### Request Body

```json
{
  "name": "Region",
  "description": "Geographic region fields",
  "fields": {
    "country": {
      "type": "string",
      "required": true,
      "allowedValues": ["US", "UK", "DE", "FR"]
    },
    "state": {
      "type": "string",
      "required": false
    }
  }
}
```

| Field         | Type           | Required | Description                             |
| ------------- | -------------- | -------- | --------------------------------------- |
| `name`        | string         | Yes      | Group name (1-100 characters, trimmed). |
| `description` | string or null | No       | Description (max 500 characters).       |
| `fields`      | object         | Yes      | Map of field name to field definition.  |

#### Response

```
HTTP 201
```

Returns the created field group object.

#### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Region",
    "description": "Geographic region fields",
    "fields": {
      "country": {"type": "string", "required": true, "allowedValues": ["US", "UK"]},
      "state": {"type": "string"}
    }
  }' \
  http://localhost:5172/v1/metadata-field-groups
```

---

### Get Field Group

```
GET /v1/metadata-field-groups/:id
```

Returns a field group by ID.

#### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Field group ID. |

---

### Update Field Group

```
PATCH /v1/metadata-field-groups/:id
```

Updates a field group. All fields are optional.

#### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Field group ID. |

#### Request Body

Same fields as create, all optional.

---

### Delete Field Group

```
DELETE /v1/metadata-field-groups/:id
```

Deletes a field group. Templates referencing this group will lose those fields from their effective schema.

#### Path Parameters

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `id`      | string | **Required.** Field group ID. |

---

## Templates

### List Templates

```
GET /v1/metadata-templates
```

Returns all metadata templates with their effective schemas (the merged result of referenced field groups plus custom fields).

#### Example

```bash
curl -b /tmp/cookies http://localhost:5172/v1/metadata-templates
```

---

### Create Template

```
POST /v1/metadata-templates
```

Creates a new metadata template.

#### Request Body

```json
{
  "name": "Support Docs Template",
  "description": "Metadata schema for support documentation",
  "fieldGroupIds": ["region-group-uuid", "product-group-uuid"],
  "customFields": {
    "priority": {
      "type": "string",
      "allowedValues": ["low", "medium", "high"],
      "default": "medium"
    }
  }
}
```

| Field           | Type            | Default      | Description                                             |
| --------------- | --------------- | ------------ | ------------------------------------------------------- |
| `name`          | string          | **Required** | Template name (1-100 characters, trimmed).              |
| `description`   | string or null  | --           | Description (max 500 characters).                       |
| `fieldGroupIds` | string[] (UUID) | `[]`         | IDs of field groups to include. Applied in order.       |
| `customFields`  | object          | `{}`         | Additional field definitions specific to this template. |

#### Response

```
HTTP 201
```

Returns the created template object with its computed `effectiveSchema`.

#### Example

```bash
curl -b /tmp/cookies -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Docs Template",
    "fieldGroupIds": ["group-uuid"],
    "customFields": {
      "priority": {"type": "string", "allowedValues": ["low", "medium", "high"]}
    }
  }' \
  http://localhost:5172/v1/metadata-templates
```

---

### Get Template

```
GET /v1/metadata-templates/:id
```

Returns a template with its effective schema and the count of sync targets using it.

#### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Template ID. |

---

### Update Template

```
PATCH /v1/metadata-templates/:id
```

Updates a template. All fields are optional.

#### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Template ID. |

#### Request Body

Same fields as create, all optional.

---

### Delete Template

```
DELETE /v1/metadata-templates/:id
```

Deletes a metadata template. Sync targets referencing this template will lose their metadata schema association.

#### Path Parameters

| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `id`      | string | **Required.** Template ID. |
