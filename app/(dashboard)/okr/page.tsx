'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Grid,
  CircularProgress,
  Stack,
  Tabs,
  Tab,
  LinearProgress,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Flag as FlagIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  CalendarMonth as CalendarIcon,
  TrackChanges as TargetIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────
interface Owner {
  id: string;
  name: string;
}

interface KeyResult {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  weight: number;
  owner: Owner | null;
}

interface Objective {
  id: string;
  title: string;
  description: string | null;
  periodType: string;
  periodLabel: string;
  status: string;
  weight: number;
  owner: Owner | null;
  keyResults: KeyResult[];
  progress: number;
}

interface KRDraft {
  title: string;
  targetValue: string;
  unit: string;
  ownerId: string;
}

// ─── Constants ────────────────────────────────────────────────
const CARD_STYLE = {
  bgcolor: dt.bg.elevated,
  border: `1px solid ${dt.border.default}`,
  borderRadius: 2,
  '&:hover': {
    borderColor: dt.border.strong,
  },
};

const STATUS_TABS = ['全部', 'ACTIVE', 'COMPLETED', 'DRAFT'] as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE: { label: '进行中', color: dt.accent.dark, bg: dt.accent.subtle },
  COMPLETED: { label: '已完成', color: dt.success.dark, bg: dt.success.subtle },
  DRAFT: { label: '草稿', color: dt.text.muted, bg: alpha(dt.text.muted, 0.08) },
};

const PERIOD_TYPE_OPTIONS = [
  { value: 'QUARTERLY', label: '季度' },
  { value: 'MONTHLY', label: '月度' },
  { value: 'ANNUAL', label: '年度' },
];

function getProgressColor(progress: number): string {
  if (progress > 70) return dt.success.main;
  if (progress > 30) return dt.warning.main;
  return dt.danger.main;
}

function getProgressBg(progress: number): string {
  if (progress > 70) return dt.success.subtle;
  if (progress > 30) return dt.warning.subtle;
  return dt.danger.subtle;
}

// ─── Empty KR draft factory ───────────────────────────────────
const newKRDraft = (): KRDraft => ({ title: '', targetValue: '100', unit: '%', ownerId: '' });

// ─── Component ────────────────────────────────────────────────
export default function OKRListPage() {
  const router = useRouter();

  // Data state
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [statusTab, setStatusTab] = useState(0);

  // Expand state per card
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    periodType: 'QUARTERLY',
    periodLabel: '',
    ownerId: '',
  });
  const [krDrafts, setKrDrafts] = useState<KRDraft[]>([newKRDraft()]);

  // ─── Fetch objectives ─────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterPeriod) params.set('period', filterPeriod);
      if (filterOwner) params.set('ownerId', filterOwner);
      const statusValue = STATUS_TABS[statusTab];
      if (statusValue !== '全部') params.set('status', statusValue);

      const res = await fetch(`/api/okr?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setObjectives(data.data);
        setPeriods(data.periods);
        setAssignees(data.assignees);
      } else {
        setError(data.error || '加载失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [filterPeriod, filterOwner, statusTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Toggle expand ────────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // ─── Create dialog handlers ───────────────────────────────
  const openDialog = () => {
    setForm({ title: '', description: '', periodType: 'QUARTERLY', periodLabel: '', ownerId: '' });
    setKrDrafts([newKRDraft()]);
    setCreateError('');
    setDialogOpen(true);
  };

  const addKR = () => setKrDrafts(prev => [...prev, newKRDraft()]);

  const removeKR = (idx: number) => {
    setKrDrafts(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const updateKR = (idx: number, field: keyof KRDraft, value: string) => {
    setKrDrafts(prev => prev.map((kr, i) => (i === idx ? { ...kr, [field]: value } : kr)));
  };

  const handleCreate = async () => {
    if (!form.title.trim()) {
      setCreateError('请输入目标标题');
      return;
    }
    if (!form.periodLabel.trim()) {
      setCreateError('请输入周期标签（如 2026-Q1）');
      return;
    }

    setCreating(true);
    setCreateError('');

    try {
      const keyResults = krDrafts
        .filter(kr => kr.title.trim())
        .map(kr => ({
          title: kr.title.trim(),
          targetValue: parseFloat(kr.targetValue) || 100,
          unit: kr.unit || '%',
          ownerId: kr.ownerId || undefined,
        }));

      const res = await fetch('/api/okr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          periodType: form.periodType,
          periodLabel: form.periodLabel.trim(),
          ownerId: form.ownerId || undefined,
          keyResults,
        }),
        credentials: 'include',
      });

      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        fetchData();
      } else {
        setCreateError(data.error || '创建失败');
      }
    } catch {
      setCreateError('网络错误，请重试');
    } finally {
      setCreating(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <Box>
      {/* Title Bar */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        mb: 3,
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1.5, sm: 0 },
      }}>
        <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700 }}>
          OKR 目标
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openDialog}
        >
          新建 OKR
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Stack spacing={1.5}>
            {/* Period + Owner selects */}
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>周期</InputLabel>
                <Select
                  value={filterPeriod}
                  label="周期"
                  onChange={e => setFilterPeriod(e.target.value)}
                >
                  <MenuItem value="">全部周期</MenuItem>
                  {periods.map(p => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>负责人</InputLabel>
                <Select
                  value={filterOwner}
                  label="负责人"
                  onChange={e => setFilterOwner(e.target.value)}
                >
                  <MenuItem value="">全部负责人</MenuItem>
                  {assignees.map(a => (
                    <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {/* Status tabs */}
            <Tabs
              value={statusTab}
              onChange={(_, v) => setStatusTab(v)}
              sx={{
                minHeight: 36,
                '& .MuiTab-root': { minHeight: 36, py: 0 },
              }}
            >
              {STATUS_TABS.map(label => (
                <Tab key={label} label={label} />
              ))}
            </Tabs>
          </Stack>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
          <CircularProgress />
        </Box>
      ) : objectives.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <FlagIcon sx={{ fontSize: 64, color: dt.text.muted, mb: 2 }} />
            <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
              暂无 OKR，点击右上角创建
            </Typography>
            <Typography variant="body2" sx={{ color: dt.text.muted, mb: 3 }}>
              创建目标和关键结果来追踪团队进度
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
              新建 OKR
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Objective cards */
        <Stack spacing={2}>
          {objectives.map(obj => {
            const isExpanded = expanded[obj.id] ?? false;
            const statusCfg = STATUS_CONFIG[obj.status] || STATUS_CONFIG.DRAFT;
            const progressColor = getProgressColor(obj.progress);
            const progressBg = getProgressBg(obj.progress);

            return (
              <Card key={obj.id} sx={CARD_STYLE}>
                <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
                  {/* Objective header */}
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 1,
                    mb: 1.5,
                  }}>
                    <CardActionArea
                      onClick={() => router.push(`/okr/${obj.id}`)}
                      sx={{
                        p: 0,
                        borderRadius: 1,
                        flex: 1,
                        '&:hover': { bgcolor: 'transparent' },
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ color: dt.text.primary, fontWeight: 600, lineHeight: 1.4 }}
                      >
                        {obj.title}
                      </Typography>
                    </CardActionArea>

                    <Chip
                      label={statusCfg.label}
                      size="small"
                      sx={{
                        bgcolor: statusCfg.bg,
                        color: statusCfg.color,
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        height: 24,
                        flexShrink: 0,
                      }}
                    />
                  </Box>

                  {/* Chips row: owner + period */}
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {obj.owner && (
                      <Chip
                        icon={<PersonIcon sx={{ fontSize: 14 }} />}
                        label={obj.owner.name}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 24,
                          fontSize: '0.75rem',
                          borderColor: dt.border.default,
                          color: dt.text.secondary,
                          '& .MuiChip-icon': { color: dt.text.muted },
                        }}
                      />
                    )}
                    <Chip
                      icon={<CalendarIcon sx={{ fontSize: 14 }} />}
                      label={obj.periodLabel}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 24,
                        fontSize: '0.75rem',
                        borderColor: dt.border.default,
                        color: dt.text.secondary,
                        '& .MuiChip-icon': { color: dt.text.muted },
                      }}
                    />
                  </Stack>

                  {/* Overall progress bar */}
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ color: dt.text.muted }}>
                        总进度
                      </Typography>
                      <Typography variant="caption" sx={{ color: progressColor, fontWeight: 700 }}>
                        {obj.progress}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={obj.progress}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: progressBg,
                        '& .MuiLinearProgress-bar': {
                          bgcolor: progressColor,
                          borderRadius: 4,
                        },
                      }}
                    />
                  </Box>

                  {/* Expand toggle for KRs */}
                  {obj.keyResults.length > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        mt: 1,
                        '&:hover': { opacity: 0.8 },
                      }}
                      onClick={() => toggleExpand(obj.id)}
                    >
                      <Typography variant="caption" sx={{ color: dt.accent.main, fontWeight: 600 }}>
                        {obj.keyResults.length} 个关键结果
                      </Typography>
                      <IconButton size="small" sx={{ ml: 0.5, p: 0 }}>
                        {isExpanded
                          ? <ExpandLessIcon sx={{ fontSize: 18, color: dt.accent.main }} />
                          : <ExpandMoreIcon sx={{ fontSize: 18, color: dt.accent.main }} />
                        }
                      </IconButton>
                    </Box>
                  )}

                  {/* Key Results expandable section */}
                  <Collapse in={isExpanded}>
                    <Stack spacing={1.5} sx={{ mt: 1.5, pl: 1, borderLeft: `2px solid ${dt.border.default}` }}>
                      {obj.keyResults.map(kr => {
                        const krProgress = kr.targetValue > 0
                          ? Math.min(Math.round((kr.currentValue / kr.targetValue) * 100), 100)
                          : 0;
                        const krColor = getProgressColor(krProgress);
                        const krBg = getProgressBg(krProgress);

                        return (
                          <Box key={kr.id} sx={{ pl: 1.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                                <TargetIcon sx={{ fontSize: 16, color: dt.text.muted, flexShrink: 0 }} />
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: dt.text.secondary,
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {kr.title}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0, ml: 1 }}>
                                <Typography variant="caption" sx={{ color: dt.text.muted }}>
                                  {kr.currentValue}/{kr.targetValue} {kr.unit}
                                </Typography>
                                <Typography variant="caption" sx={{ color: krColor, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>
                                  {krProgress}%
                                </Typography>
                              </Stack>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={krProgress}
                              sx={{
                                height: 4,
                                borderRadius: 2,
                                bgcolor: krBg,
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: krColor,
                                  borderRadius: 2,
                                },
                              }}
                            />
                            {kr.owner && (
                              <Typography variant="caption" sx={{ color: dt.text.muted, mt: 0.25, display: 'block' }}>
                                {kr.owner.name}
                              </Typography>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* ─── Create OKR Dialog ─────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onClose={() => !creating && setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ color: dt.text.primary }}>新建 OKR</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 0.5 }}>
            {createError && (
              <Alert severity="error">{createError}</Alert>
            )}

            {/* Title */}
            <TextField
              label="目标标题"
              required
              fullWidth
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="例如：提升产品用户留存率"
            />

            {/* Description */}
            <TextField
              label="描述（可选）"
              fullWidth
              multiline
              rows={2}
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            />

            {/* Period Type + Period Label */}
            <Stack direction="row" spacing={2}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>周期类型</InputLabel>
                <Select
                  value={form.periodType}
                  label="周期类型"
                  onChange={e => setForm(prev => ({ ...prev, periodType: e.target.value }))}
                >
                  {PERIOD_TYPE_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="周期标签"
                required
                size="small"
                fullWidth
                value={form.periodLabel}
                onChange={e => setForm(prev => ({ ...prev, periodLabel: e.target.value }))}
                placeholder="例如：2026-Q1"
              />
            </Stack>

            {/* Owner */}
            <FormControl size="small" fullWidth>
              <InputLabel>负责人（可选）</InputLabel>
              <Select
                value={form.ownerId}
                label="负责人（可选）"
                onChange={e => setForm(prev => ({ ...prev, ownerId: e.target.value }))}
              >
                <MenuItem value="">不指定</MenuItem>
                {assignees.map(a => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Key Results */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ color: dt.text.primary }}>
                  关键结果
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={addKR}
                  sx={{ textTransform: 'none' }}
                >
                  添加 KR
                </Button>
              </Box>

              <Stack spacing={1.5}>
                {krDrafts.map((kr, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      border: `1px solid ${dt.border.default}`,
                      bgcolor: dt.bg.base,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: dt.text.muted, fontWeight: 600 }}>
                          KR {idx + 1}
                        </Typography>
                        {krDrafts.length > 1 && (
                          <IconButton
                            size="small"
                            onClick={() => removeKR(idx)}
                            sx={{ ml: 'auto', p: 0.5 }}
                          >
                            <DeleteIcon sx={{ fontSize: 16, color: dt.danger.main }} />
                          </IconButton>
                        )}
                      </Box>
                      <TextField
                        label="关键结果标题"
                        size="small"
                        fullWidth
                        value={kr.title}
                        onChange={e => updateKR(idx, 'title', e.target.value)}
                        placeholder="例如：月活用户从10万提升到15万"
                      />
                      <Stack direction="row" spacing={1.5}>
                        <TextField
                          label="目标值"
                          size="small"
                          type="number"
                          value={kr.targetValue}
                          onChange={e => updateKR(idx, 'targetValue', e.target.value)}
                          sx={{ width: 120 }}
                        />
                        <TextField
                          label="单位"
                          size="small"
                          value={kr.unit}
                          onChange={e => updateKR(idx, 'unit', e.target.value)}
                          sx={{ width: 100 }}
                          placeholder="%"
                        />
                        <FormControl size="small" sx={{ flex: 1 }}>
                          <InputLabel>负责人</InputLabel>
                          <Select
                            value={kr.ownerId}
                            label="负责人"
                            onChange={e => updateKR(idx, 'ownerId', e.target.value)}
                          >
                            <MenuItem value="">不指定</MenuItem>
                            {assignees.map(a => (
                              <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => setDialogOpen(false)}
            disabled={creating}
            variant="outlined"
          >
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating}
            variant="contained"
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {creating ? '创建中...' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
