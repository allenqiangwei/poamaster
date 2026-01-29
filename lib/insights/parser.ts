// lib/insights/parser.ts

import { ParseResult } from './types';

export class FileParser {
  async parse(file: File): Promise<ParseResult> {
    const fileType = this.detectFileType(file);

    switch (fileType) {
      case 'txt':
        return this.parseTxt(file);
      case 'docx':
        return this.parseDocx(file);
      case 'pdf':
        return this.parsePdf(file);
      default:
        throw new Error(`不支持的文件类型: ${file.type}`);
    }
  }

  private detectFileType(file: File): 'txt' | 'docx' | 'pdf' {
    const type = file.type;

    if (type === 'text/plain') return 'txt';
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'docx';
    }
    if (type === 'application/pdf') return 'pdf';

    throw new Error('不支持的文件类型');
  }

  private async parseTxt(file: File): Promise<ParseResult> {
    const text = await file.text();

    return {
      text,
      charCount: text.length,
      metadata: {
        fileType: 'txt',
        fileName: file.name
      }
    };
  }

  private async parseDocx(file: File): Promise<ParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用 mammoth 解析 Word 文档
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      charCount: result.value.length,
      metadata: {
        fileType: 'docx',
        fileName: file.name
      }
    };
  }

  private async parsePdf(file: File): Promise<ParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用现有的 pdf-parse
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();

    return {
      text: textResult.text,
      charCount: textResult.text.length,
      pageCount: textResult.total,
      metadata: {
        fileType: 'pdf',
        fileName: file.name
      }
    };
  }

  async parseFromPath(filePath: string): Promise<ParseResult> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      const text = buffer.toString('utf-8');
      return {
        text,
        charCount: text.length,
        metadata: {
          fileType: 'txt',
          fileName: path.basename(filePath)
        }
      };
    }

    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });

      return {
        text: result.value,
        charCount: result.value.length,
        metadata: {
          fileType: 'docx',
          fileName: path.basename(filePath)
        }
      };
    }

    if (ext === '.pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();

      return {
        text: textResult.text,
        charCount: textResult.text.length,
        pageCount: textResult.total,
        metadata: {
          fileType: 'pdf',
          fileName: path.basename(filePath)
        }
      };
    }

    throw new Error(`不支持的文件扩展名: ${ext}`);
  }
}
