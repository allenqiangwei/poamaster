'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { ReportType } from '@prisma/client';
import ModelSelectionDialog from '@/components/ModelSelectionDialog';
import { renderPdfThumbnails } from '@/lib/pdf-thumbnails';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY: '日报',
  WEEKLY: '周报',
  OTHER: '其他',
};

interface PdfPreviewData {
  reportId: string;
  totalPages: number;
  thumbnails: { page: number; dataUrl: string }[];
  truncated: boolean;
}

export default function UploadPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [reportType, setReportType] = useState<ReportType>('WEEKLY');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showModelDialog, setShowModelDialog] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // PDF preview state
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewData | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const validExtensions = ['.pdf', '.txt', '.jpg', '.jpeg', '.png', '.webp'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  const isPdfFile = (f: File) =>
    f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

  const isImageFile = (f: File) =>
    f.type.startsWith('image/') || imageExtensions.some(ext => f.name.toLowerCase().endsWith(ext));

  const setFileWithPreview = useCallback((f: File) => {
    setFile(f);
    setError(null);
    // Reset PDF preview when selecting a new file
    setPdfPreview(null);
    setSelectedPages(new Set());
    if (isImageFile(f)) {
      const url = URL.createObjectURL(f);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const validateFile = (f: File): boolean => {
    const hasValidExtension = validExtensions.some(ext =>
      f.name.toLowerCase().endsWith(ext)
    );
    const hasValidMime = f.type.startsWith('image/') || f.type === 'application/pdf' || f.type === 'text/plain';
    if (!hasValidExtension && !hasValidMime) {
      setError('请选择 PDF、文本或图片文件（JPG/PNG）');
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFileWithPreview(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && validateFile(droppedFile)) {
      setFileWithPreview(droppedFile);
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (inputMode !== 'file' || uploading || extracting) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const pastedFile = item.getAsFile();
        if (pastedFile) {
          const ext = pastedFile.type === 'image/png' ? '.png' : '.jpg';
          const named = new File([pastedFile], `clipboard-${Date.now()}${ext}`, { type: pastedFile.type });
          setFileWithPreview(named);
        }
        return;
      }
    }
  }, [inputMode, uploading, extracting, setFileWithPreview]);

  // Toggle a single page selection
  const togglePage = (page: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
  };

  const selectAllPages = () => {
    if (!pdfPreview) return;
    setSelectedPages(new Set(pdfPreview.thumbnails.map(t => t.page)));
  };

  const deselectAllPages = () => {
    setSelectedPages(new Set());
  };

  const invertSelection = () => {
    if (!pdfPreview) return;
    setSelectedPages(prev => {
      const next = new Set<number>();
      for (const t of pdfPreview.thumbnails) {
        if (!prev.has(t.page)) next.add(t.page);
      }
      return next;
    });
  };

  const handleUpload = async () => {
    if (inputMode === 'file' && !file) {
      setError('请先选择文件');
      return;
    }
    if (inputMode === 'text' && !textInput.trim()) {
      setError('请输入报告内容');
      return;
    }

    setError(null);

    // For PDF files without preview yet: upload for preview first
    if (inputMode === 'file' && file && isPdfFile(file) && !pdfPreview) {
      await uploadPdfForPreview();
      return;
    }

    // For PDF with preview: check page selection
    if (pdfPreview && selectedPages.size === 0) {
      setError('请至少选择一页');
      return;
    }

    setShowModelDialog(true);
  };

  // Upload PDF and render thumbnails client-side
  const uploadPdfForPreview = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10);
    setError(null);

    try {
      // Run upload and thumbnail rendering in parallel
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);
      formData.append('reportType', reportType);
      formData.append('reportDate', new Date(reportDate).toISOString());

      const [uploadResult, thumbnailResult] = await Promise.all([
        fetch('/api/pulse/reports/upload-preview', {
          method: 'POST',
          body: formData,
        }).then(r => r.json()),
        renderPdfThumbnails(file),
      ]);

      if (!uploadResult.success) {
        setError(uploadResult.error || '上传失败');
        setUploading(false);
        return;
      }

      setProgress(100);
      setUploading(false);

      const preview: PdfPreviewData = {
        reportId: uploadResult.data.reportId,
        totalPages: thumbnailResult.totalPages,
        thumbnails: thumbnailResult.thumbnails,
        truncated: thumbnailResult.truncated,
      };
      setPdfPreview(preview);
      setSelectedPages(new Set(preview.thumbnails.map(t => t.page)));
    } catch {
      setError('上传失败');
      setUploading(false);
    }
  };

  const handleModelConfirm = async (model: string) => {
    setShowModelDialog(false);
    setExtracting(true);
    setProgress(10);

    try {
      // PDF preview flow: use existing reportId + selectedPages
      if (pdfPreview) {
        const extractRes = await fetch('/api/pulse/analysis/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: pdfPreview.reportId,
            model,
            selectedPages: Array.from(selectedPages).sort((a, b) => a - b),
          }),
        });
        const extractData = await extractRes.json();

        setProgress(100);

        if (!extractData.success) {
          setError(extractData.error || 'AI 提取失败');
          setExtracting(false);
          return;
        }

        const sessionId = extractData.data.sessionId;
        router.push(`/pulse/${projectId}/review/${sessionId}`);
        return;
      }

      // Non-PDF flow: upload + extract in sequence
      let uploadFile = file;
      if (inputMode === 'text') {
        const blob = new Blob([textInput], { type: 'text/plain' });
        uploadFile = new File([blob], `report-${Date.now()}.txt`, { type: 'text/plain' });
      }

      if (!uploadFile) return;

      setUploading(true);

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('projectId', projectId);
      formData.append('reportType', reportType);
      formData.append('reportDate', new Date(reportDate).toISOString());

      const uploadRes = await fetch('/api/pulse/reports/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadData.success) {
        setError(uploadData.error || '上传失败');
        setUploading(false);
        setExtracting(false);
        return;
      }

      setProgress(40);
      setUploading(false);

      const reportId = uploadData.data.id;
      const extractRes = await fetch('/api/pulse/analysis/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, model }),
      });
      const extractData = await extractRes.json();

      setProgress(100);

      if (!extractData.success) {
        setError(extractData.error || 'AI 提取失败');
        setExtracting(false);
        return;
      }

      const sessionId = extractData.data.sessionId;
      router.push(`/pulse/${projectId}/review/${sessionId}`);
    } catch {
      setError('处理失败');
      setUploading(false);
      setExtracting(false);
    }
  };

  const isPdf = file && isPdfFile(file);
  const showFileDropZone = inputMode === 'file' && !pdfPreview;
  const showPageSelector = inputMode === 'file' && !!pdfPreview;

  // Button label logic
  const getButtonLabel = () => {
    if (uploading) return '上传中...';
    if (extracting) return 'AI 提取中...';
    if (showPageSelector) return `提取选中的 ${selectedPages.size} 页`;
    if (inputMode === 'file') {
      if (isPdf) return '上传并选择页面';
      return '上传并提取';
    }
    return '提交并提取';
  };

  const isSubmitDisabled =
    uploading ||
    extracting ||
    (inputMode === 'file' && !pdfPreview && !file) ||
    (inputMode === 'text' && !textInput.trim()) ||
    (showPageSelector && selectedPages.size === 0);

  return (
    <Box sx={{ p: 3, maxWidth: pdfPreview ? 900 : 600, mx: 'auto', transition: 'max-width 0.3s' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => {
          if (pdfPreview) {
            // Go back to file selection
            setPdfPreview(null);
            setSelectedPages(new Set());
            setFile(null);
          } else {
            router.push(`/pulse/${projectId}`);
          }
        }}
        sx={{ mb: 2 }}
      >
        {pdfPreview ? '重新选择文件' : '返回'}
      </Button>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          {pdfPreview ? '选择要分析的页面' : '上传报告'}
        </Typography>

        {pdfPreview && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {file?.name} · 共 {pdfPreview.totalPages} 页
          </Typography>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Input mode toggle - hidden during page selection */}
        {!pdfPreview && (
          <ToggleButtonGroup
            value={inputMode}
            exclusive
            onChange={(_, newMode) => {
              if (newMode && !uploading && !extracting) {
                setInputMode(newMode);
                setError(null);
              }
            }}
            fullWidth
            sx={{ mb: 3 }}
          >
            <ToggleButton value="file">
              <CloudUploadIcon sx={{ mr: 1 }} />
              上传文件
            </ToggleButton>
            <ToggleButton value="text">
              <TextFieldsIcon sx={{ mr: 1 }} />
              直接输入
            </ToggleButton>
          </ToggleButtonGroup>
        )}

        {/* File drop zone */}
        {showFileDropZone && (
          <Paper
            variant="outlined"
            onPaste={handlePaste}
            tabIndex={0}
            sx={{
              p: 4,
              mb: 3,
              textAlign: 'center',
              border: '2px dashed',
              borderColor: file ? 'primary.main' : 'grey.400',
              bgcolor: file ? 'primary.50' : 'grey.50',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main' },
              '&:focus': { borderColor: 'primary.main', outline: 'none' },
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {file && imagePreview ? (
              <Box>
                <Box
                  component="img"
                  src={imagePreview}
                  alt="预览"
                  sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: 1, mb: 1, objectFit: 'contain' }}
                />
                <Typography color="primary.main" fontWeight="bold">
                  {file.name}
                </Typography>
              </Box>
            ) : file ? (
              <>
                <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
                <Typography color="primary.main" fontWeight="bold">
                  {file.name}
                </Typography>
              </>
            ) : (
              <>
                <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.500', mb: 1 }} />
                <Typography>点击、拖拽文件到此处，或直接粘贴截图</Typography>
                <Typography variant="caption" color="text.secondary">
                  支持 PDF、TXT、JPG、PNG 格式
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 1 }}>
                  <ContentPasteIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.disabled">
                    Ctrl/Cmd+V 粘贴剪贴板图片
                  </Typography>
                </Box>
              </>
            )}
          </Paper>
        )}

        {/* PDF Page Selection Grid */}
        {showPageSelector && pdfPreview && (
          <Box sx={{ mb: 3 }}>
            {/* Selection controls */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip
                icon={<CheckBoxIcon />}
                label="全选"
                onClick={selectAllPages}
                variant={selectedPages.size === pdfPreview.totalPages ? 'filled' : 'outlined'}
                size="small"
              />
              <Chip
                icon={<CheckBoxOutlineBlankIcon />}
                label="全不选"
                onClick={deselectAllPages}
                variant="outlined"
                size="small"
              />
              <Chip
                icon={<SwapHorizIcon />}
                label="反选"
                onClick={invertSelection}
                variant="outlined"
                size="small"
              />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                已选 {selectedPages.size}/{pdfPreview.totalPages} 页
              </Typography>
            </Box>

            {/* Thumbnail grid */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 1.5,
                maxHeight: 480,
                overflow: 'auto',
                p: 1,
              }}
            >
              {pdfPreview.thumbnails.map(({ page, dataUrl }) => {
                const isSelected = selectedPages.has(page);
                return (
                  <Box
                    key={page}
                    onClick={() => togglePage(page)}
                    sx={{
                      cursor: 'pointer',
                      border: 2,
                      borderColor: isSelected ? 'primary.main' : 'grey.300',
                      borderRadius: 1,
                      overflow: 'hidden',
                      position: 'relative',
                      opacity: isSelected ? 1 : 0.5,
                      transition: 'all 0.15s',
                      '&:hover': {
                        borderColor: 'primary.main',
                        opacity: 1,
                      },
                    }}
                  >
                    <Box
                      component="img"
                      src={dataUrl}
                      alt={`第 ${page} 页`}
                      sx={{
                        width: '100%',
                        display: 'block',
                        bgcolor: 'grey.100',
                        minHeight: 120,
                      }}
                    />
                    <Box sx={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                    }}>
                      <Checkbox
                        checked={isSelected}
                        size="small"
                        sx={{
                          p: 0,
                          bgcolor: 'rgba(255,255,255,0.85)',
                          borderRadius: '4px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => togglePage(page)}
                      />
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        textAlign: 'center',
                        py: 0.5,
                        bgcolor: isSelected ? 'primary.50' : 'grey.50',
                        fontWeight: isSelected ? 'bold' : 'normal',
                      }}
                    >
                      第 {page} 页
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            {pdfPreview.truncated && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                仅显示前 {pdfPreview.thumbnails.length} 页缩略图（共 {pdfPreview.totalPages} 页）
              </Typography>
            )}
          </Box>
        )}

        {/* Text input */}
        {inputMode === 'text' && (
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              multiline
              rows={12}
              placeholder="在此粘贴或输入报告内容...&#10;&#10;支持直接粘贴周报、日报等文本内容"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={uploading || extracting}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontFamily: 'monospace',
                },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {textInput.length} 字符
            </Typography>
          </Box>
        )}

        {/* Report info - hidden during page selection */}
        {!pdfPreview && (
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <FormControl sx={{ flex: 1 }}>
              <InputLabel>报告类型</InputLabel>
              <Select
                value={reportType}
                label="报告类型"
                onChange={(e) => setReportType(e.target.value as ReportType)}
              >
                {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              type="date"
              label="报告日期"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Box>
        )}

        {/* Progress */}
        {(uploading || extracting) && (
          <Box sx={{ mb: 3 }}>
            <LinearProgress variant="determinate" value={progress} sx={{ mb: 1 }} />
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {uploading ? '正在上传文件...' : '正在 AI 提取条目...'}
            </Typography>
          </Box>
        )}

        {/* Submit */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={isSubmitDisabled}
            fullWidth
          >
            {getButtonLabel()}
          </Button>
        </Box>
      </Paper>

      {/* Model Selection Dialog */}
      <ModelSelectionDialog
        open={showModelDialog}
        onClose={() => setShowModelDialog(false)}
        onConfirm={handleModelConfirm}
      />
    </Box>
  );
}
