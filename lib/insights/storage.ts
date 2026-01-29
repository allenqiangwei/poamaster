// lib/insights/storage.ts

import fs from 'fs/promises';
import path from 'path';
import { FILE_UPLOAD_CONFIG } from './constants';

export class FileStorage {
  private uploadDir: string;

  constructor(uploadDir: string = FILE_UPLOAD_CONFIG.UPLOAD_DIR) {
    this.uploadDir = uploadDir;
  }

  async saveFile(file: File, assigneeId: string): Promise<string> {
    // 1. Ensure upload directory exists
    const assigneeDir = path.join(this.uploadDir, assigneeId);
    await fs.mkdir(assigneeDir, { recursive: true });

    // 2. Generate unique filename (timestamp + original name)
    const timestamp = Date.now();
    const ext = path.extname(file.name);
    const basename = path.basename(file.name, ext);
    const fileName = `${timestamp}-${basename}${ext}`;
    const filePath = path.join(assigneeDir, fileName);

    // 3. Write file to disk
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(filePath, buffer);

    // 4. Return relative path
    return path.join(assigneeId, fileName);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, relativePath);
    await fs.unlink(fullPath);
  }

  getFullPath(relativePath: string): string {
    return path.join(this.uploadDir, relativePath);
  }
}
