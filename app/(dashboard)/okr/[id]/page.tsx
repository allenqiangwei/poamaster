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
  Chip,
  IconButton,
  LinearProgress,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import FlagIcon from '@mui/icons-material/Flag';
import { designTokens as dt } from '@/lib/theme';

// ─── Types ───────────────────────────────────────────────────
interface Assignee {
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
  owner: Assignee | null;
}

interface Objective {
  id: string;
  title: string;
  description: string | null;
  periodType: 'QUARTERLY' | 'MONTHLY' | 'ANNUAL';
  periodLabel: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  weight: number;
  owner: Assignee | null;
  keyResults: KeyResult[];
}

type ObjStatus = Objective['status'];

// ─── Constants ───────────────────────────────────────────────
const STATUS_OPTIONS: { value: ObjStatus; label: string }[] = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'ACTIVE', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
];

const STATUS_COLORS: Record<ObjStatus, string> = {
  DRAFT: dt.text.muted,
  ACTIVE: dt.accent.main,
  COMPLETED: dt.success.main,
  CANCELLED: dt.danger.main,
};

const PERIOD_LABELS: Record<string, string> = {
  QUARTERLY: '季度',
  MONTHLY: '月度',
  ANNUAL: '年度',
};

const CARD_STYLE = {
  background: dt.bg.elevated,
  border: `1px solid ${dt.border.default}`,
  borderRadius: '16px',
  p: 3,
};

// ─── Helpers ─────────────────────────────────────────────────
function computeProgress(krs: KeyResult[]): number {
  const totalWeight = krs.reduce((s, kr) => s + kr.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = krs.reduce((s, kr) => {
    const p = kr.targetValue > 0 ? Math.min(kr.currentValue / kr.targetValue, 1) : 0;
    return s + p * kr.weight;
  }, 0);
  return Math.round((weighted / totalWeight) * 100);
}

function progressColor(pct: number): string {
  if (pct >= 70) return dt.success.main;
  if (pct >= 40) return dt.warning.main;
  return dt.danger.main;
}

// ─── Component ───────────────────────────────────────────────
export default function OkrDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // Data
  const [objective, setObjective] = useState<Objective | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  // Editable objective fields
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOwnerId, setEditOwnerId] = useState('');
  const [editStatus, setEditStatus] = useState<ObjStatus>('DRAFT');

  // KR inline edit tracking: { [krId]: currentValue }
  const [krEdits, setKrEdits] = useState<Record<string, string>>({});

  // Add KR dialog
  const [addKrOpen, setAddKrOpen] = useState(false);
  const [newKr, setNewKr] = useState({
    title: '',
    targetValue: '100',
    unit: '%',
    weight: '1',
    ownerId: '',
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [updatingKr, setUpdatingKr] = useState<string | null>(null);
  const [addingKr, setAddingKr] = useState(false);

  // ─── Data loading ───────────────────────────────────────────
  const loadObjective = useCallback(async () => {
    try {
      const res = await fetch(`/api/okr/${id}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        const obj: Objective = data.data;
        setObjective(obj);
        setEditTitle(obj.title);
        setEditDescription(obj.description || '');
        setEditOwnerId(obj.owner?.id || '');
        setEditStatus(obj.status);
        // Initialize KR edits with current values
        const edits: Record<string, string> = {};
        obj.keyResults.forEach((kr) => {
          edits[kr.id] = String(kr.currentValue);
        });
        setKrEdits(edits);
      } else {
        setError(data.error || '目标不存在');
      }
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAssignees = useCallback(async () => {
    try {
      const res = await fetch('/api/assignees', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setAssignees(data.data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (id) {
      loadObjective();
      loadAssignees();
    }
  }, [id, loadObjective, loadAssignees]);

  // ─── Objective save ─────────────────────────────────────────
  const handleSaveObjective = async () => {
    if (!editTitle.trim()) {
      setError('请输入目标标题');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/okr/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          status: editStatus,
          ownerId: editOwnerId || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setObjective(data.data);
        setSnackbar('目标已保存');
      } else {
        setError(data.error || '保存失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  };

  // ─── Status quick-change ────────────────────────────────────
  const handleStatusChange = async (newStatus: ObjStatus) => {
    setEditStatus(newStatus);
    try {
      const res = await fetch(`/api/okr/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setObjective(data.data);
        setSnackbar('状态已更新');
      }
    } catch {
      // silent
    }
  };

  // ─── KR inline update ──────────────────────────────────────
  const handleUpdateKr = async (kr: KeyResult) => {
    const val = parseFloat(krEdits[kr.id] ?? '');
    if (isNaN(val)) return;
    if (val === kr.currentValue) return;

    setUpdatingKr(kr.id);
    try {
      const res = await fetch(`/api/okr/${id}/key-results`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ krId: kr.id, currentValue: val }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Reload to get fresh KRs
        await loadObjective();
        setSnackbar('关键结果已更新');
      } else {
        setError(data.error || '更新失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setUpdatingKr(null);
    }
  };

  // ─── Add KR ─────────────────────────────────────────────────
  const handleAddKr = async () => {
    if (!newKr.title.trim()) {
      setError('请输入关键结果标题');
      return;
    }
    setAddingKr(true);
    setError('');
    try {
      const res = await fetch(`/api/okr/${id}/key-results`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newKr.title.trim(),
          targetValue: parseFloat(newKr.targetValue) || 100,
          unit: newKr.unit || '%',
          weight: parseFloat(newKr.weight) || 1,
          ownerId: newKr.ownerId || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await loadObjective();
        setAddKrOpen(false);
        setNewKr({ title: '', targetValue: '100', unit: '%', weight: '1', ownerId: '' });
        setSnackbar('关键结果已添加');
      } else {
        setError(data.error || '添加失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setAddingKr(false);
    }
  };

  // ─── Delete ─────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteDialog(false);
    try {
      const res = await fetch(`/api/okr/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        router.push('/okr');
      } else {
        setError('删除失败');
      }
    } catch {
      setError('删除失败');
    }
  };

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!objective) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
        <Alert severity="error">{error || '目标不存在'}</Alert>
        <Button sx={{ mt: 2 }} onClick={() => router.push('/okr')}>
          返回 OKR 列表
        </Button>
      </Box>
    );
  }

  const overallProgress = computeProgress(objective.keyResults);
  const pColor = progressColor(overallProgress);

  // ─── Render ─────────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1, flexWrap: 'wrap' }}>
        <IconButton onClick={() => router.push('/okr')} aria-label="返回">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flex: 1, minWidth: 200, color: dt.text.primary }}>
          {objective.title}
        </Typography>
        <Chip
          label={STATUS_OPTIONS.find((s) => s.value === objective.status)?.label}
          sx={{
            fontWeight: 700,
            color: '#fff',
            bgcolor: STATUS_COLORS[objective.status],
          }}
          size="small"
        />
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select
            value={editStatus}
            onChange={(e) => handleStatusChange(e.target.value as ObjStatus)}
            sx={{ fontSize: '0.85rem' }}
          >
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ── Overall Progress ───────────────────────────────── */}
      <Paper sx={{ ...CARD_STYLE, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <TrackChangesIcon sx={{ color: pColor, fontSize: 22 }} />
          <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 700 }}>
            整体进度
          </Typography>
          <Typography variant="h5" sx={{ ml: 'auto', color: pColor, fontWeight: 800 }}>
            {overallProgress}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={overallProgress}
          sx={{
            height: 10,
            borderRadius: 5,
            bgcolor: `${pColor}15`,
            '& .MuiLinearProgress-bar': {
              borderRadius: 5,
              bgcolor: pColor,
            },
          }}
        />
        <Typography variant="caption" sx={{ mt: 1, display: 'block', color: dt.text.muted }}>
          {objective.keyResults.length} 个关键结果的加权平均进度
        </Typography>
      </Paper>

      {/* ── Objective Info ──────────────────────────────────── */}
      <Paper sx={{ ...CARD_STYLE, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <FlagIcon sx={{ color: dt.accent.main, fontSize: 20 }} />
          <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 700 }}>
            目标信息
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            label="目标标题"
            fullWidth
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />

          <TextField
            label="描述"
            fullWidth
            multiline
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="描述这个目标的背景和期望结果..."
          />

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                周期类型
              </Typography>
              <Chip
                label={PERIOD_LABELS[objective.periodType] || objective.periodType}
                variant="outlined"
                size="small"
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                周期
              </Typography>
              <Chip label={objective.periodLabel} variant="outlined" size="small" />
            </Box>
          </Box>

          <FormControl fullWidth size="small">
            <InputLabel>负责人</InputLabel>
            <Select
              value={editOwnerId}
              label="负责人"
              onChange={(e) => setEditOwnerId(e.target.value)}
            >
              <MenuItem value="">
                <em>未指派</em>
              </MenuItem>
              {assignees.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveObjective}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存目标'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialog(true)}
            >
              删除目标
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* ── Key Results ─────────────────────────────────────── */}
      <Paper sx={{ ...CARD_STYLE, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <TrackChangesIcon sx={{ color: dt.purple.main, fontSize: 20 }} />
          <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 700, flex: 1 }}>
            关键结果
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setAddKrOpen(true)}
          >
            添加关键结果
          </Button>
        </Box>

        {objective.keyResults.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: '12px' }}>
            暂无关键结果，点击上方按钮添加
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {objective.keyResults.map((kr, idx) => {
              const krProgress =
                kr.targetValue > 0
                  ? Math.round(Math.min(kr.currentValue / kr.targetValue, 1) * 100)
                  : 0;
              const krColor = progressColor(krProgress);
              const editVal = krEdits[kr.id] ?? String(kr.currentValue);
              const isChanged = parseFloat(editVal) !== kr.currentValue;

              return (
                <Box
                  key={kr.id}
                  sx={{
                    p: 2,
                    borderRadius: '12px',
                    border: `1px solid ${dt.border.default}`,
                    bgcolor: dt.bg.surface,
                    transition: 'border-color 0.2s',
                    '&:hover': { borderColor: dt.border.strong },
                  }}
                >
                  {/* KR header row */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: dt.text.inverse,
                        bgcolor: dt.purple.main,
                        px: 1,
                        py: 0.25,
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.7rem',
                      }}
                    >
                      KR{idx + 1}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ flex: 1, fontWeight: 600, color: dt.text.primary }}
                    >
                      {kr.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, color: krColor }}
                    >
                      {krProgress}%
                    </Typography>
                  </Box>

                  {/* Progress bar */}
                  <LinearProgress
                    variant="determinate"
                    value={krProgress}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      mb: 1.5,
                      bgcolor: `${krColor}15`,
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 3,
                        bgcolor: krColor,
                      },
                    }}
                  />

                  {/* KR detail row */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Inline edit current value */}
                    <TextField
                      size="small"
                      type="number"
                      label="当前值"
                      value={editVal}
                      onChange={(e) =>
                        setKrEdits((prev) => ({ ...prev, [kr.id]: e.target.value }))
                      }
                      sx={{ width: 100 }}
                      inputProps={{ step: 'any' }}
                    />
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!isChanged || updatingKr === kr.id}
                      onClick={() => handleUpdateKr(kr)}
                      sx={{ minWidth: 'auto', px: 2 }}
                    >
                      {updatingKr === kr.id ? '...' : '更新'}
                    </Button>

                    <Typography variant="caption" sx={{ color: dt.text.muted }}>
                      / {kr.targetValue} {kr.unit}
                    </Typography>

                    {kr.owner && (
                      <Chip
                        label={kr.owner.name}
                        size="small"
                        variant="outlined"
                        sx={{ ml: 'auto' }}
                      />
                    )}

                    <Chip
                      label={`权重 ${kr.weight}`}
                      size="small"
                      sx={{
                        bgcolor: dt.purple.subtle,
                        color: dt.purple.dark,
                        fontWeight: 600,
                        fontSize: '0.7rem',
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>

      {/* ── Add KR Dialog ───────────────────────────────────── */}
      <Dialog
        open={addKrOpen}
        onClose={() => setAddKrOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>添加关键结果</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="关键结果标题"
              fullWidth
              required
              value={newKr.title}
              onChange={(e) => setNewKr({ ...newKr, title: e.target.value })}
              placeholder="例如：月活跃用户数达到 10000"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="目标值"
                type="number"
                value={newKr.targetValue}
                onChange={(e) => setNewKr({ ...newKr, targetValue: e.target.value })}
                sx={{ flex: 1 }}
                inputProps={{ step: 'any' }}
              />
              <TextField
                label="单位"
                value={newKr.unit}
                onChange={(e) => setNewKr({ ...newKr, unit: e.target.value })}
                sx={{ width: 100 }}
                placeholder="%"
              />
            </Box>
            <TextField
              label="权重"
              type="number"
              value={newKr.weight}
              onChange={(e) => setNewKr({ ...newKr, weight: e.target.value })}
              inputProps={{ step: '0.1', min: '0' }}
              helperText="用于加权计算整体进度，默认 1.0"
            />
            <FormControl fullWidth size="small">
              <InputLabel>负责人</InputLabel>
              <Select
                value={newKr.ownerId}
                label="负责人"
                onChange={(e) => setNewKr({ ...newKr, ownerId: e.target.value })}
              >
                <MenuItem value="">
                  <em>未指派</em>
                </MenuItem>
                {assignees.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddKrOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleAddKr}
            disabled={addingKr || !newKr.title.trim()}
          >
            {addingKr ? '添加中...' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Dialog ───────────────────────────────────── */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除目标「{objective.title}」吗？所有关键结果将一并删除，此操作不可恢复。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" autoFocus>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ────────────────────────────────────────── */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={2000}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Box>
  );
}
