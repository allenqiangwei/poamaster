// lib/insights/storage.ts

import fs from 'fs/promises';
import path from 'path';
import { FILE_UPLOAD_CONFIG } from './constants';

/**
 * Sanitizes a filename to prevent path traversal attacks
 * @param filename - The original filename
 * @returns Sanitized filename safe for filesystem operations
 */
function sanitizeFilename(filename: string): string {
  // Remove any path separators and parent directory references
  const basename = filename.replace(/^.*[\\\/]/, ''); // Remove path
  const cleaned = basename.replace(/\.\.+/g, '.'); // Remove .. sequences

  // Only allow alphanumeric, dots, hyphens, underscores
  const safe = cleaned.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Limit length
  const maxLength = 200;
  return safe.substring(0, maxLength);
}

export class FileStorage {
  private uploadDir: string;

  constructor(uploadDir: string = FILE_UPLOAD_CONFIG.UPLOAD_DIR) {
    this.uploadDir = uploadDir;
  }

  async saveFile(file: File, assigneeId: string): Promise<string> {
    // Validate assigneeId
    if (!assigneeId || typeof assigneeId !== 'string' || assigneeId.trim().length === 0) {
      throw new Error('Invalid assigneeId');
    }

    // Sanitize assigneeId to prevent path traversal
    const safeAssigneeId = assigneeId.replace(/[^a-zA-Z0-9_-]/g, '_');

    // Ensure upload directory exists
    const assigneeDir = path.join(this.uploadDir, safeAssigneeId);
    await fs.mkdir(assigneeDir, { recursive: true });

    // Sanitize filename
    const safeName = sanitizeFilename(file.name);
    if (!safeName || safeName === '.' || safeName === '..') {
      throw new Error('Invalid filename');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8); // Add randomness
    const ext = path.extname(safeName);
    const basename = path.basename(safeName, ext);
    const fileName = `${timestamp}-${random}-${basename}${ext}`;
    const filePath = path.join(assigneeDir, fileName);

    // Verify final path is within upload directory (security check)
    const uploadDirResolved = await fs.realpath(this.uploadDir);
    const assigneeDirResolved = path.resolve(uploadDirResolved, safeAssigneeId);
    const filePathResolved = path.resolve(assigneeDirResolved, fileName);

    if (!filePathResolved.startsWith(uploadDirResolved)) {
      throw new Error('Path traversal detected');
    }

    // Write file
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(filePath, buffer);
    } catch (error) {
      // Clean up on failure
      try {
        await fs.unlink(filePath);
      } catch {}
      throw error;
    }

    // Return relative path
    return path.join(safeAssigneeId, fileName);
  }

  async deleteFile(relativePath: string): Promise<void> {
    if (!relativePath || typeof relativePath !== 'string') {
      throw new Error('Invalid path');
    }

    const fullPath = path.join(this.uploadDir, relativePath);

    // Resolve to prevent path traversal
    const uploadDirResolved = await fs.realpath(this.uploadDir);
    const fullPathResolved = path.resolve(this.uploadDir, relativePath);

    // Verify path is within upload directory
    if (!fullPathResolved.startsWith(uploadDirResolved)) {
      throw new Error('Path traversal detected');
    }

    await fs.unlink(fullPathResolved);
  }

  getFullPath(relativePath: string): string {
    return path.join(this.uploadDir, relativePath);
  }
}
