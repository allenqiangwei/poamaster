'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import { EntryDimension, ReportType } from '@prisma/client';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/pulse/constants';
import { EvidenceHistoryItem } from '@/lib/pulse/types';

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  DAILY: '日报',
  WEEKLY: '周报',
  OTHER: '其他',
};

interface Entry {
  id: string;
  projectId: string;
  dimension: EntryDimension;
  title: string;
  evidenceCurrent: string;
  sourceCurrent: {
    reportType: ReportType;
    reportDate: string;
    fileName: string;
  };
  evidenceHistory: EvidenceHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const entryId = params.entryId as string;

  const [entry, setEntry] = useState<Entry | null>(null);
  const [title, setTitle] = useState('');
  const [dimension, setDimension] = useState<EntryDimension | ''>('');
  const [evidence, setEvidence] = useState('');
  const [reportType, setReportType] = useState<ReportType>('OTHER');
  const [reportDate, setReportDate] = useState('');
  const [fileName, setFileName] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntry = useCallback(async () => {
    try {
      const res = await fetch(`/api/pulse/entries/${entryId}`);
      const data = await res.json();
      if (data.success) {
        const e = data.data as Entry;
        setEntry(e);
        setTitle(e.title);
        setDimension(e.dimension);
        setEvidence(e.evidenceCurrent);
        setReportType(e.sourceCurrent.reportType);
        setReportDate(new Date(e.sourceCurrent.reportDate).toISOString().split('T')[0]);
        setFileName(e.sourceCurrent.fileName);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch entry');
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !dimension || !evidence.trim()) {
      setError('请填写所有必填字段');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/pulse/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          dimension,
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
        setError(data.error || '保存失败');
      }
    } catch {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!entry) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">条目不存在</Alert>
      </Box>
    );
  }

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
          编辑条目
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="标题 *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || !title.trim() || !dimension || !evidence.trim()}
            >
              {saving ? '保存中...' : '保存修改'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => router.push(`/pulse/${projectId}`)}
            >
              取消
            </Button>
          </Box>
        </form>

        {/* Evidence history */}
        {entry.evidenceHistory.length > 0 && (
          <Accordion sx={{ mt: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <HistoryIcon fontSize="small" />
                <Typography>历史记录 ({entry.evidenceHistory.length})</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {entry.evidenceHistory.map((item, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 2, mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Chip
                      label={item.source.fileName}
                      size="small"
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(item.addedAt).toLocaleString('zh-CN')}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {item.evidence}
                  </Typography>
                </Paper>
              ))}
            </AccordionDetails>
          </Accordion>
        )}
      </Paper>
    </Box>
  );
}
