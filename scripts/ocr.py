#!/usr/bin/env python3
"""
PaddleOCR 文字识别脚本
用于从图片中提取文字，支持中英文混合识别
"""

from paddleocr import PaddleOCR
import sys
import os

def main():
    if len(sys.argv) < 2:
        print("Usage: python ocr.py <image_path>", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]

    # 检查文件是否存在
    if not os.path.exists(image_path):
        print(f"Error: Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    try:
        # 初始化 PaddleOCR
        # 首次运行会自动下载模型文件到 ~/.paddleocr/
        ocr = PaddleOCR(
            use_angle_cls=True,      # 启用文字方向分类，支持旋转文字
            lang='ch',               # 中文+英文混合识别
            use_gpu=False,           # CPU 模式（如有 GPU 可设为 True）
            show_log=False,          # 不显示日志
            det_db_thresh=0.3,       # 文本检测阈值，降低可检测更多文本
            det_db_box_thresh=0.5,   # 文本框阈值
            use_space_char=True,     # 识别空格
        )

        # 执行 OCR
        result = ocr.ocr(image_path, cls=True)

        # 提取文字
        texts = []
        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2 and line[1]:
                    text, confidence = line[1]
                    # 只保留置信度较高的结果（>0.5）
                    if confidence > 0.5:
                        texts.append(text)

        # 输出结果（每行一个文本块）
        if texts:
            print('\n'.join(texts))
        else:
            # 如果没有识别到文字，输出空字符串而不是错误
            print('')

    except Exception as e:
        print(f"Error during OCR processing: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
