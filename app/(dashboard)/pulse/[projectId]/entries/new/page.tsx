'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { EntryDimension, ReportType } from '@prisma/client';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/pulse/constants';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY: '日报',
  WEEKLY: '周报',
  OTHER: '其他',
};

export default function NewEntryPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [title, setTitle] = useState('');
  const [dimension, setDimension] = useState<EntryDimension | ''>('');
  const [evidence, setEvidence] = useState('');
  const [reportType, setReportType] = useState<ReportType>('OTHER');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [fileName, setFileName] = useState('手动输入');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !dimension || !evidence.trim()) {
      setError('请填写所有必填字段');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/pulse/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          dimension,
          title: title.trim(),
          evidence: evidence.trim(),
          source: {
            reportType,
            reportDate: new Date(reportDate).toISOString(),
            fileName,
          },
        }),
      });
      const data = await res.json();

      if (data.success) {
        router.push(`/pulse/${projectId}`);
      } else {
        setError(data.error || '创建失败');
      }
    } catch {
      setError('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push(`/pulse/${projectId}`)}
        sx={{ mb: 2 }}
      >
        返回
      </Button>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          手动添加条目
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="标题 *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="简洁描述这个条目"
            sx={{ mb: 3 }}
            autoFocus
          />

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>维度 *</InputLabel>
            <Select
              value={dimension}
              label="维度 *"
              onChange={(e) => setDimension(e.target.value as EntryDimension)}
            >
              {DIMENSION_ORDER.map(dim => (
                <MenuItem key={dim} value={dim}>
                  {DIMENSION_LABELS[dim]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            multiline
            rows={4}
            label="证据 *"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="详细描述或引用原文"
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
            来源信息
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <FormControl sx={{ minWidth: 150 }}>
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
            />

            <TextField
              label="文件名"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              sx={{ flex: 1 }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !title.trim() || !dimension || !evidence.trim()}
            >
              {loading ? '创建中...' : '创建条目'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => router.push(`/pulse/${projectId}`)}
            >
              取消
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
