'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  Card,
  CardContent,
  TextField,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  Snackbar,
  Collapse,
  IconButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { EntryDimension } from '@prisma/client';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/pulse/constants';
import { AICandidate, SimilarityResult } from '@/lib/pulse/types';

type Action = 'create' | 'update' | 'ignore';

interface CandidateState {
  title: string;
  action: Action;
  updateTargetId: string | null;
  similarEntries: SimilarityResult[];
  loadingSimilar: boolean;
}

interface AnalysisSession {
  id: string;
  reportId: string;
  aiOutputRaw: {
    candidates: AICandidate[];
    empty_dimensions: EntryDimension[];
    warnings: string[];
  };
  status: string;
  report: {
    projectId: string;
    fileName: string;
    reportType: string;
    reportDate: string;
  };
}

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [candidateStates, setCandidateStates] = useState<Record<number, CandidateState>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Collapsible dimensions
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set(DIMENSION_ORDER));

  const fetchSimilarEntries = useCallback(async (index: number, candidate: AICandidate) => {
    setCandidateStates(prev => ({
      ...prev,
      [index]: { ...prev[index], loadingSimilar: true },
    }));

    try {
      const res = await fetch('/api/pulse/entries/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          dimension: candidate.dimension,
          title: candidate.title,
          evidence: candidate.evidence_quote,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setCandidateStates(prev => ({
          ...prev,
          [index]: {
            ...prev[index],
            similarEntries: data.data,
            loadingSimilar: false,
            // Auto-select update if high similarity match found
            action: data.data.length > 0 && data.data[0].score > 0.5 ? 'update' : 'create',
            updateTargetId: data.data.length > 0 && data.data[0].score > 0.5 ? data.data[0].entryId : null,
          },
        }));
      }
    } catch {
      setCandidateStates(prev => ({
        ...prev,
        [index]: { ...prev[index], loadingSimilar: false },
      }));
    }
  }, [projectId]);

  // Fetch session data
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/pulse/analysis/${sessionId}`);
        const data = await res.json();
        if (data.success) {
          setSession(data.data);

          // Initialize candidate states
          const states: Record<number, CandidateState> = {};
          data.data.aiOutputRaw.candidates.forEach((c: AICandidate, index: number) => {
            states[index] = {
              title: c.title,
              action: 'create',
              updateTargetId: null,
              similarEntries: [],
              loadingSimilar: false,
            };
          });
          setCandidateStates(states);

          // Fetch similar entries for each candidate
          data.data.aiOutputRaw.candidates.forEach((c: AICandidate, index: number) => {
            fetchSimilarEntries(index, c);
          });
        } else {
          setError(data.error);
        }
      } catch {
        setError('Failed to fetch session');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId, fetchSimilarEntries]);

  const updateCandidateState = (index: number, updates: Partial<CandidateState>) => {
    setCandidateStates(prev => ({
      ...prev,
      [index]: { ...prev[index], ...updates },
    }));
  };

  const toggleDimension = (dimension: string) => {
    setExpandedDimensions(prev => {
      const next = new Set(prev);
      if (next.has(dimension)) {
        next.delete(dimension);
      } else {
        next.add(dimension);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const operations = session.aiOutputRaw.candidates.map((candidate, index) => {
        const state = candidateStates[index];
        return {
          action: state.action,
          candidate: {
            ...candidate,
            title: state.title,
          },
          updateTargetId: state.action === 'update' ? state.updateTargetId : undefined,
        };
      });

      const res = await fetch('/api/pulse/entries/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          source: {
            reportType: session.report.reportType,
            reportDate: session.report.reportDate,
            fileName: session.report.fileName,
          },
          operations,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push(`/pulse/${projectId}`);
        }, 1500);
      } else {
        setError(data.error || '提交失败');
      }
    } catch {
      setError('提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!session) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">分析会话不存在</Alert>
      </Box>
    );
  }

  const { candidates, empty_dimensions, warnings } = session.aiOutputRaw;

  // Group candidates by dimension
  const candidatesByDimension = DIMENSION_ORDER.reduce((acc, dim) => {
    acc[dim] = candidates
      .map((c, idx) => ({ candidate: c, index: idx }))
      .filter(({ candidate }) => candidate.dimension === dim);
    return acc;
  }, {} as Record<string, Array<{ candidate: AICandidate; index: number }>>);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push(`/pulse/${projectId}`)}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flex: 1 }}>
          审核 AI 提取结果
        </Typography>
        <Chip label={session.report.fileName} variant="outlined" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          <Typography variant="subtitle2">AI 提示:</Typography>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* Empty dimensions notice */}
      {empty_dimensions.length > 0 && (
        <Alert severity="info" icon={<InfoIcon />} sx={{ mb: 2 }}>
          以下维度未提取到内容: {empty_dimensions.map(d => DIMENSION_LABELS[d]).join('、')}
        </Alert>
      )}

      {/* Candidates by dimension */}
      {candidates.length === 0 ? (
        <Alert severity="info">未提取到任何条目</Alert>
      ) : (
        <>
          {DIMENSION_ORDER.map(dim => {
            const dimCandidates = candidatesByDimension[dim];
            if (dimCandidates.length === 0) return null;

            return (
              <Paper key={dim} sx={{ mb: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    p: 2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  onClick={() => toggleDimension(dim)}
                >
                  {expandedDimensions.has(dim) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  <Typography variant="h6" sx={{ ml: 1, flex: 1 }}>
                    {DIMENSION_LABELS[dim]}
                  </Typography>
                  <Chip label={dimCandidates.length} size="small" />
                </Box>

                <Collapse in={expandedDimensions.has(dim)}>
                  <Box sx={{ px: 2, pb: 2 }}>
                    {dimCandidates.map(({ candidate, index }) => {
                      const state = candidateStates[index];
                      if (!state) return null;

                      return (
                        <Card key={index} variant="outlined" sx={{ mb: 2 }}>
                          <CardContent>
                            {/* Title */}
                            <TextField
                              fullWidth
                              label="标题"
                              value={state.title}
                              onChange={(e) => updateCandidateState(index, { title: e.target.value })}
                              size="small"
                              sx={{ mb: 2 }}
                            />

                            {/* Evidence */}
                            <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                              <Typography variant="body2" color="text.secondary">
                                {candidate.evidence_quote}
                              </Typography>
                            </Paper>

                            {/* Confidence */}
                            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                              <Chip
                                label={`置信度: ${Math.round(candidate.confidence * 100)}%`}
                                size="small"
                                color={candidate.confidence > 0.8 ? 'success' : candidate.confidence > 0.5 ? 'warning' : 'default'}
                              />
                            </Box>

                            {/* Action selection */}
                            <FormControl component="fieldset">
                              <RadioGroup
                                row
                                value={state.action}
                                onChange={(e) => updateCandidateState(index, {
                                  action: e.target.value as Action,
                                  updateTargetId: e.target.value === 'update' && state.similarEntries.length > 0
                                    ? state.similarEntries[0].entryId
                                    : null,
                                })}
                              >
                                <FormControlLabel value="create" control={<Radio size="small" />} label="新建" />
                                <FormControlLabel
                                  value="update"
                                  control={<Radio size="small" />}
                                  label="更新已有"
                                  disabled={state.similarEntries.length === 0}
                                />
                                <FormControlLabel value="ignore" control={<Radio size="small" />} label="忽略" />
                              </RadioGroup>
                            </FormControl>

                            {/* Similar entries dropdown */}
                            {state.action === 'update' && state.similarEntries.length > 0 && (
                              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                                <Select
                                  value={state.updateTargetId || ''}
                                  onChange={(e) => updateCandidateState(index, { updateTargetId: e.target.value })}
                                >
                                  {state.similarEntries.map((similar) => (
                                    <MenuItem key={similar.entryId} value={similar.entryId}>
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Chip
                                          label={`${Math.round(similar.score * 100)}%`}
                                          size="small"
                                          color={similar.score > 0.7 ? 'success' : 'default'}
                                        />
                                        <Typography variant="body2" noWrap>
                                          {similar.title}
                                        </Typography>
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            )}

                            {state.loadingSimilar && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                <CircularProgress size={16} />
                                <Typography variant="caption" color="text.secondary">
                                  查找相似条目...
                                </Typography>
                              </Box>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Box>
                </Collapse>
              </Paper>
            );
          })}

          {/* Submit button */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              size="large"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? '提交中...' : '确认入库'}
            </Button>
          </Box>
        </>
      )}

      {/* Success snackbar */}
      <Snackbar
        open={success}
        message="入库成功！正在跳转..."
        autoHideDuration={1500}
      />
    </Box>
  );
}
