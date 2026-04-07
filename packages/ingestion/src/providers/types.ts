export interface SourceObject {
  /** Unique identifier within the source (S3 key, Confluence page ID, etc.) */
  key: string;
  /** Version/hash for change detection (S3 ETag, Confluence version, etc.) */
  etag: string;
  /** Object size in bytes */
  size: number;
  /** Last modification timestamp */
  lastModified: Date;
}

export interface BrowseResult {
  /** Subdirectory prefixes at this level */
  folders: string[];
  /** Files at this level */
  objects: SourceObject[];
}

export interface SourceProvider {
  /** List all objects in the source for sync diff computation */
  listObjects(config: Record<string, unknown>, sourceName?: string): Promise<SourceObject[]>;

  /** Download object content by key */
  download(config: Record<string, unknown>, key: string, sourceName?: string): Promise<Buffer>;

  /** Browse one level of a hierarchy — folders + files (optional, S3-like sources only) */
  browse?(config: Record<string, unknown>, path: string, sourceName?: string): Promise<BrowseResult>;

  /** Upload content to the source (optional, S3-like sources only) */
  upload?(
    config: Record<string, unknown>,
    key: string,
    content: Buffer,
    contentType?: string,
    sourceName?: string,
  ): Promise<void>;

  /** Delete an object from the source (optional) */
  deleteObject?(config: Record<string, unknown>, key: string, sourceName?: string): Promise<void>;

  /** Copy an object within the source — used for move operations (optional) */
  copyObject?(config: Record<string, unknown>, sourceKey: string, destKey: string, sourceName?: string): Promise<void>;

  /** Create a folder/directory placeholder (optional, S3-like sources only) */
  createFolder?(config: Record<string, unknown>, path: string, sourceName?: string): Promise<void>;
}
