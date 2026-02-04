# 环境变量配置

将以下配置添加到您的 `.env` 文件中：

```bash
# =====================================
# 本地 OCR 配置
# =====================================

# 启用本地 PaddleOCR（默认：false）
# 启用后将使用本地 OCR 进行文字识别，大幅降低成本
USE_LOCAL_OCR=false

# Python 路径（可选，默认：python3）
# macOS/Linux 通常使用 python3
# Windows 可能需要完整路径
PYTHON_PATH=python3

# 示例：
# macOS/Linux: PYTHON_PATH=/usr/bin/python3
# Windows: PYTHON_PATH=C:\Python39\python.exe
```

## 启用本地 OCR 的步骤

1. **安装 PaddleOCR**：
   ```bash
   pip3 install paddlepaddle paddleocr
   ```

2. **测试安装**：
   ```bash
   python3 scripts/ocr.py <测试图片>
   ```

3. **启用配置**：
   在 `.env` 中设置 `USE_LOCAL_OCR=true`

4. **重启应用**：
   ```bash
   npm run dev
   ```

详细说明请查看 [PADDLEOCR_SETUP.md](./PADDLEOCR_SETUP.md)
