'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Button,
  Chip,
  IconButton,
  Fade,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Slider,
  Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PauseCircleOutline as PauseIcon,
  PlayCircleOutline as PlayIcon,
  ArrowBack as BackIcon,
  Topic as TopicIcon,
  AccessTime as TimeIcon,
  FiberManualRecord as DotIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';

// ─── Types ─────────────────────────────────────────────────
interface Topic {
  id: string;
  name: string;
  keywords: string[];
  source: string;
  weight: number;
  isPaused: boolean;
  lastHitAt: string | null;
  createdAt: string;
  comboStats?: {
    active: number;
    retired: number;
    new: number;
  };
}

// ─── Styles ────────────────────────────────────────────────
const CARD_STYLE = {
  background: dt.bg.elevated,
  border: `1px solid ${dt.border.default}`,
  borderRadius: '16px',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    border: `1px solid ${dt.border.strong}`,
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
  },
};

// ─── Helpers ───────────────────────────────────────────────
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '从未';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ─── Main Component ────────────────────────────────────────
export default function TopicsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTopic, setEditTopic] = useState<Topic | null>(null);
  const [editName, setEditName] = useState('');
  const [editWeight, setEditWeight] = useState(80);
  const [editSaving, setEditSaving] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTopic, setDeleteTopic] = useState<Topic | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Fetch topics (both active and paused) ───────────────
  const loadTopics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [activeRes, pausedRes] = await Promise.all([
        fetch('/api/insights/topics', { credentials: 'include' }),
        fetch('/api/insights/topics?paused=true', { credentials: 'include' }),
      ]);
      const activeData = await activeRes.json();
      const pausedData = await pausedRes.json();

      if (activeData.success && pausedData.success) {
        const all = [...(activeData.topics || []), ...(pausedData.topics || [])];
        // Sort: active first (by weight desc), then paused (by weight desc)
        all.sort((a: Topic, b: Topic) => {
          if (a.isPaused !== b.isPaused) return a.isPaused ? 1 : -1;
          return b.weight - a.weight;
        });
        setTopics(all);
      } else {
        setError(activeData.error || pausedData.error || '加载失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // ─── Add topic ───────────────────────────────────────────
  const handleAdd = async () => {
    if (!addName.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch('/api/insights/topics', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setAddOpen(false);
        setAddName('');
        setSnackbar('话题已添加，AI 正在生成关键字搭配...');
        loadTopics();
      } else {
        setSnackbar(data.error || '添加失败');
      }
    } catch {
      setSnackbar('网络错误');
    } finally {
      setAddSaving(false);
    }
  };

  // ─── Edit topic ──────────────────────────────────────────
  const openEdit = (topic: Topic) => {
    setEditTopic(topic);
    setEditName(topic.name);
    setEditWeight(topic.weight);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editTopic || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/insights/topics/${editTopic.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          weight: editWeight,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditOpen(false);
        setEditTopic(null);
        setSnackbar('话题已更新');
        loadTopics();
      } else {
        setSnackbar(data.error || '更新失败');
      }
    } catch {
      setSnackbar('网络错误');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Toggle pause ────────────────────────────────────────
  const handleTogglePause = async (topic: Topic) => {
    try {
      const res = await fetch(`/api/insights/topics/${topic.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: !topic.isPaused }),
      });
      const data = await res.json();
      if (data.success) {
        setSnackbar(topic.isPaused ? '话题已恢复' : '话题已暂停');
        loadTopics();
      } else {
        setSnackbar(data.error || '操作失败');
      }
    } catch {
      setSnackbar('网络错误');
    }
  };

  // ─── Delete topic ────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTopic) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/insights/topics/${deleteTopic.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setDeleteOpen(false);
        setDeleteTopic(null);
        setSnackbar('话题已删除');
        loadTopics();
      } else {
        setSnackbar(data.error || '删除失败');
      }
    } catch {
      setSnackbar('网络错误');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ pt: 1, pb: 3 }}>
        <Fade in timeout={600}>
          <Box>
            <Button
              startIcon={<BackIcon />}
              onClick={() => router.push('/insights')}
              sx={{
                color: dt.text.secondary,
                fontWeight: 500,
                mb: 2,
                px: 1,
                '&:hover': {
                  color: dt.accent.main,
                  bgcolor: dt.accent.subtle,
                },
              }}
            >
              返回简报
            </Button>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Box>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    color: dt.text.primary,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    mb: 0.5,
                  }}
                >
                  话题管理
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: dt.text.muted, maxWidth: 480 }}
                >
                  管理洞察简报的关注话题。AI 会自动为每个话题生成搜索关键字，你只需添加话题名称。
                </Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAddOpen(true)}
              >
                添加话题
              </Button>
            </Box>
          </Box>
        </Fade>
      </Box>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            bgcolor: dt.danger.subtle,
            color: dt.danger.dark,
            border: '1px solid rgba(239, 68, 68, 0.15)',
            '& .MuiAlert-icon': { color: dt.danger.main },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 12,
            gap: 3,
          }}
        >
          <CircularProgress
            size={48}
            thickness={3}
            sx={{
              color: dt.accent.main,
              '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
            }}
          />
          <Typography variant="body2" sx={{ color: dt.text.muted }}>
            正在加载话题...
          </Typography>
        </Box>
      ) : topics.length === 0 ? (
        /* Empty state */
        <Card sx={{ ...CARD_STYLE, '&:hover': { transform: 'none' } }} elevation={0}>
          <CardContent
            sx={{
              py: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <TopicIcon sx={{ fontSize: 48, color: dt.text.muted, opacity: 0.5 }} />
            <Typography variant="body1" sx={{ color: dt.text.muted }}>
              暂无关注话题
            </Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAddOpen(true)}
            >
              添加第一个话题
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Topic cards */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {topics.map((topic, i) => (
            <Fade in timeout={400 + i * 80} key={topic.id}>
              <Card
                sx={{
                  ...CARD_STYLE,
                  opacity: topic.isPaused ? 0.6 : 1,
                  '&:hover': {
                    ...CARD_STYLE['&:hover'],
                    opacity: 1,
                  },
                }}
                elevation={0}
              >
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 2,
                    }}
                  >
                    {/* Left: info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Name + source badge */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          mb: 1,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 700,
                            color: dt.text.primary,
                            lineHeight: 1.3,
                          }}
                        >
                          {topic.name}
                        </Typography>
                        <Chip
                          label={topic.source === 'manual' ? '手动' : '自动'}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            ...(topic.source === 'manual'
                              ? {
                                  bgcolor: dt.accent.subtle,
                                  color: dt.accent.main,
                                  border: `1px solid ${dt.accent.border}`,
                                }
                              : {
                                  bgcolor: dt.bg.deep,
                                  color: dt.text.muted,
                                  border: `1px solid ${dt.border.default}`,
                                }),
                          }}
                        />
                        {topic.isPaused && (
                          <Chip
                            icon={
                              <PauseIcon
                                sx={{ fontSize: '14px !important' }}
                              />
                            }
                            label="已暂停"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              bgcolor: dt.warning.subtle,
                              color: dt.warning.dark,
                              border: `1px solid rgba(245, 158, 11, 0.2)`,
                              '& .MuiChip-icon': { color: dt.warning.dark },
                            }}
                          />
                        )}
                      </Box>

                      {/* Combo stats */}
                      {topic.comboStats && (
                        <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
                          <Chip
                            label={`${topic.comboStats.active} 个搭配`}
                            size="small"
                            sx={{
                              height: 24,
                              fontSize: '0.72rem',
                              fontWeight: 500,
                              bgcolor: dt.success.subtle,
                              color: dt.success.dark,
                              border: `1px solid rgba(34, 197, 94, 0.2)`,
                            }}
                          />
                          {topic.comboStats.new > 0 && (
                            <Chip
                              label={`${topic.comboStats.new} 个新搭配`}
                              size="small"
                              sx={{
                                height: 24,
                                fontSize: '0.72rem',
                                fontWeight: 500,
                                bgcolor: dt.accent.subtle,
                                color: dt.accent.main,
                                border: `1px solid ${dt.accent.border}`,
                              }}
                            />
                          )}
                          {topic.comboStats.retired > 0 && (
                            <Chip
                              label={`${topic.comboStats.retired} 个已废弃`}
                              size="small"
                              sx={{
                                height: 24,
                                fontSize: '0.72rem',
                                fontWeight: 500,
                                bgcolor: dt.bg.deep,
                                color: dt.text.muted,
                                border: `1px solid ${dt.border.default}`,
                              }}
                            />
                          )}
                        </Box>
                      )}

                      {/* Meta row: weight + last hit */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          <DotIcon
                            sx={{
                              fontSize: 8,
                              color:
                                topic.weight >= 70
                                  ? dt.success.main
                                  : topic.weight >= 40
                                  ? dt.warning.main
                                  : dt.text.muted,
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{ color: dt.text.muted }}
                          >
                            权重 {topic.weight}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          <TimeIcon
                            sx={{ fontSize: 14, color: dt.text.muted }}
                          />
                          <Typography
                            variant="caption"
                            sx={{ color: dt.text.muted }}
                          >
                            上次研究: {formatTime(topic.lastHitAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Right: actions */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        flexShrink: 0,
                      }}
                    >
                      <Tooltip title="编辑" arrow>
                        <IconButton
                          size="small"
                          onClick={() => openEdit(topic)}
                          sx={{
                            color: dt.text.muted,
                            '&:hover': {
                              color: dt.accent.main,
                              bgcolor: dt.accent.subtle,
                            },
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip
                        title={topic.isPaused ? '恢复' : '暂停'}
                        arrow
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleTogglePause(topic)}
                          sx={{
                            color: dt.text.muted,
                            '&:hover': {
                              color: topic.isPaused
                                ? dt.success.main
                                : dt.warning.main,
                              bgcolor: topic.isPaused
                                ? dt.success.subtle
                                : dt.warning.subtle,
                            },
                          }}
                        >
                          {topic.isPaused ? (
                            <PlayIcon fontSize="small" />
                          ) : (
                            <PauseIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除" arrow>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setDeleteTopic(topic);
                            setDeleteOpen(true);
                          }}
                          sx={{
                            color: dt.text.muted,
                            '&:hover': {
                              color: dt.danger.main,
                              bgcolor: dt.danger.subtle,
                            },
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Fade>
          ))}
        </Box>
      )}

      {/* ─── Add Topic Dialog ─────────────────────────────── */}
      <Dialog
        open={addOpen}
        onClose={() => !addSaving && setAddOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: dt.text.primary }}>
          添加话题
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
          <TextField
            label="话题名称"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="例如：AI 行业动态"
            required
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setAddOpen(false)}
            disabled={addSaving}
            sx={{ color: dt.text.secondary }}
          >
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={!addName.trim() || addSaving}
          >
            {addSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Edit Topic Dialog ────────────────────────────── */}
      <Dialog
        open={editOpen}
        onClose={() => !editSaving && setEditOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: dt.text.primary }}>
          编辑话题
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
          <TextField
            label="话题名称"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            fullWidth
            autoFocus
          />
          <Box>
            <Typography
              variant="body2"
              sx={{ color: dt.text.secondary, mb: 1, fontWeight: 500 }}
            >
              权重: {editWeight}
            </Typography>
            <Slider
              value={editWeight}
              onChange={(_, v) => setEditWeight(v as number)}
              min={0}
              max={100}
              step={5}
              valueLabelDisplay="auto"
              sx={{
                color: dt.accent.main,
                '& .MuiSlider-thumb': {
                  width: 18,
                  height: 18,
                  '&:hover, &.Mui-focusVisible': {
                    boxShadow: `0 0 0 6px ${dt.accent.subtle}`,
                  },
                },
                '& .MuiSlider-rail': {
                  bgcolor: dt.bg.deep,
                },
              }}
            />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <Typography variant="caption" sx={{ color: dt.text.muted }}>
                低优先级
              </Typography>
              <Typography variant="caption" sx={{ color: dt.text.muted }}>
                高优先级
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setEditOpen(false)}
            disabled={editSaving}
            sx={{ color: dt.text.secondary }}
          >
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleEdit}
            disabled={!editName.trim() || editSaving}
          >
            {editSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ───────────────────── */}
      <Dialog
        open={deleteOpen}
        onClose={() => !deleteLoading && setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, color: dt.text.primary }}>
          确认删除
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: dt.text.secondary }}>
            确定要删除话题「{deleteTopic?.name}」吗？此操作不可撤销。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setDeleteOpen(false)}
            disabled={deleteLoading}
            sx={{ color: dt.text.secondary }}
          >
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleDelete}
            disabled={deleteLoading}
            sx={{
              background: dt.danger.main,
              '&:hover': { background: dt.danger.dark },
            }}
          >
            {deleteLoading ? '删除中...' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Snackbar ─────────────────────────────────────── */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Box>
  );
}
