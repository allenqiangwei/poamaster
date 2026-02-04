import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * PaddleOCR 封装
 * 提供高精度的本地 OCR 能力，特别优化中文识别
 */
export class PaddleOCR {
  private pythonPath: string;
  private scriptPath: string;
  private enabled: boolean;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.scriptPath = join(process.cwd(), 'scripts', 'ocr.py');
    this.enabled = process.env.USE_LOCAL_OCR === 'true';
  }

  /**
   * 检查 PaddleOCR 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      // 尝试运行 Python 并检查 PaddleOCR 是否已安装
      await this.runCommand(['-c', 'import paddleocr; print("ok")']);
      return true;
    } catch (error) {
      console.warn('[PaddleOCR] Not available:', error);
      return false;
    }
  }

  /**
   * 使用 PaddleOCR 提取图片文字
   */
  async extractText(imageBuffer: Buffer, mimeType?: string): Promise<string> {
    if (!this.enabled) {
      throw new Error('PaddleOCR is not enabled. Set USE_LOCAL_OCR=true in .env');
    }

    // 确定图片格式
    const ext = this.getImageExtension(mimeType);
    const tempPath = join('/tmp', `ocr-${randomUUID()}${ext}`);

    try {
      // 保存临时图片
      await writeFile(tempPath, imageBuffer);

      // 运行 OCR
      console.log('[PaddleOCR] Processing image:', tempPath);
      const result = await this.runOCR(tempPath);
      console.log('[PaddleOCR] Extracted', result.length, 'characters');

      return result;
    } catch (error) {
      console.error('[PaddleOCR] Extraction failed:', error);
      throw new Error(`PaddleOCR 识别失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      // 清理临时文件
      await unlink(tempPath).catch(() => {});
    }
  }

  /**
   * 运行 OCR 脚本
   */
  private runOCR(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, [this.scriptPath, imagePath]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`OCR process exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to spawn OCR process: ${error.message}`));
      });

      // 60 秒超时
      setTimeout(() => {
        process.kill();
        reject(new Error('OCR process timed out after 60 seconds'));
      }, 60000);
    });
  }

  /**
   * 运行简单的 Python 命令（用于检查可用性）
   */
  private runCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, args);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr));
        } else {
          resolve(stdout.trim());
        }
      });

      // 5 秒超时
      setTimeout(() => {
        process.kill();
        reject(new Error('Command timed out'));
      }, 5000);
    });
  }

  /**
   * 根据 MIME 类型确定文件扩展名
   */
  private getImageExtension(mimeType?: string): string {
    if (!mimeType) return '.png';

    const typeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };

    return typeMap[mimeType] || '.png';
  }
}
