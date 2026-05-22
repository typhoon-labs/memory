/** Metadata for a stored blob object. */
export interface BlobObject {
  key: string;
  etag: string;
  lastModified: Date;
  size: number;
}

/** Result of listing objects at a hierarchical prefix. */
export interface ListResult {
  folders: string[];
  objects: BlobObject[];
}

/**
 * Generic blob/object storage interface.
 * Adapters implement this for S3, GCS, Azure Blob, local filesystem, etc.
 */
export interface BlobStore {
  /** List all objects under a prefix (recursive, paginated internally). */
  list(prefix: string): Promise<BlobObject[]>;

  /** List one level of hierarchy at a prefix — folders + objects. */
  listByPrefix(prefix: string): Promise<ListResult>;

  /** Download an object's content by key. */
  download(key: string): Promise<Buffer>;

  /** Upload content to a key. */
  upload(key: string, body: Buffer | Uint8Array | string, contentType?: string): Promise<void>;

  /** Delete an object by key. */
  delete(key: string): Promise<void>;

  /** Copy an object to a new key within the same store. */
  copy(sourceKey: string, destinationKey: string): Promise<void>;
}
