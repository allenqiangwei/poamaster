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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { ReportType } from '@prisma/client';

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

  const [file, setFile] = useState<File | null>(null);
  const [reportType, setReportType] = useState<ReportType>('WEEKLY');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);

  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.pdf')) {
        setError('请选择 PDF 文件');
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
      if (!droppedFile.name.endsWith('.pdf')) {
        setError('请选择 PDF 文件');
        return;
      }
      setFile(droppedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('请先选择文件');
      return;
    }

    setUploading(true);
    setProgress(10);
    setError(null);

    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', file);
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

      // Step 2: Extract with AI
      const reportId = uploadData.data.id;
      const extractRes = await fetch('/api/pulse/analysis/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
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

        {/* File drop zone */}
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
            accept=".pdf"
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
              <Typography>点击或拖拽 PDF 文件到此处</Typography>
              <Typography variant="caption" color="text.secondary">
                支持周报、日报等 PDF 格式报告
              </Typography>
            </>
          )}
        </Paper>

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
            disabled={!file || uploading || extracting}
            fullWidth
          >
            {uploading ? '上传中...' : extracting ? 'AI 提取中...' : '上传并提取'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
