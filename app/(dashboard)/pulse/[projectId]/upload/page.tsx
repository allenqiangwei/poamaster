'use client';

import { useState, useRef } from 'react';
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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import { ReportType } from '@prisma/client';
import ModelSelectionDialog from '@/components/ModelSelectionDialog';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY: '日报',
  WEEKLY: '周报',
  OTHER: '其他',
};

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
  const [selectedModel, setSelectedModel] = useState<string>('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validExtensions = ['.pdf', '.txt'];
      const hasValidExtension = validExtensions.some(ext =>
        selectedFile.name.toLowerCase().endsWith(ext)
      );
      if (!hasValidExtension) {
        setError('请选择 PDF 或文本文件');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const validExtensions = ['.pdf', '.txt'];
      const hasValidExtension = validExtensions.some(ext =>
        droppedFile.name.toLowerCase().endsWith(ext)
      );
      if (!hasValidExtension) {
        setError('请选择 PDF 或文本文件');
        return;
      }
      setFile(droppedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    // 验证输入
    if (inputMode === 'file' && !file) {
      setError('请先选择文件');
      return;
    }
    if (inputMode === 'text' && !textInput.trim()) {
      setError('请输入报告内容');
      return;
    }

    setError(null);
    setShowModelDialog(true);
  };

  const handleModelConfirm = async (model: string) => {
    setSelectedModel(model);
    setShowModelDialog(false);
    setUploading(true);
    setProgress(10);

    try {
      // 如果是文本模式，创建虚拟 PDF 文件（实际上创建 txt 文件）
      let uploadFile = file;
      if (inputMode === 'text') {
        const blob = new Blob([textInput], { type: 'text/plain' });
        uploadFile = new File([blob], `report-${Date.now()}.txt`, { type: 'text/plain' });
      }

      if (!uploadFile) return;

      // Step 1: Upload file
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
        return;
      }

      setProgress(40);
      setUploading(false);
      setExtracting(true);

      // Step 2: Extract with AI (pass model parameter)
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

      // Redirect to review page
      const sessionId = extractData.data.sessionId;
      router.push(`/pulse/${projectId}/review/${sessionId}`);
    } catch {
      setError('处理失败');
      setUploading(false);
      setExtracting(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push(`/pulse/${projectId}`)}
        sx={{ mb: 2 }}
      >
        返回
      </Button>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          上传报告
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Input mode toggle */}
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

        {/* File drop zone */}
        {inputMode === 'file' && (
          <Paper
          variant="outlined"
          sx={{
            p: 4,
            mb: 3,
            textAlign: 'center',
            border: '2px dashed',
            borderColor: file ? 'primary.main' : 'grey.400',
            bgcolor: file ? 'primary.50' : 'grey.50',
            cursor: 'pointer',
            '&:hover': { borderColor: 'primary.main' },
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.500', mb: 1 }} />
          {file ? (
            <Typography color="primary.main" fontWeight="bold">
              {file.name}
            </Typography>
          ) : (
            <>
              <Typography>点击或拖拽文件到此处</Typography>
              <Typography variant="caption" color="text.secondary">
                支持 PDF、TXT 格式的周报、日报等报告
              </Typography>
            </>
          )}
        </Paper>
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

        {/* Report info */}
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
            disabled={
              uploading ||
              extracting ||
              (inputMode === 'file' && !file) ||
              (inputMode === 'text' && !textInput.trim())
            }
            fullWidth
          >
            {uploading ? '上传中...' : extracting ? 'AI 提取中...' : inputMode === 'file' ? '上传并提取' : '提交并提取'}
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
