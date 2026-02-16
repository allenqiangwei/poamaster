'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Tabs,
  Tab,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import { Add as AddIcon, Gavel as GavelIcon } from '@mui/icons-material';

interface Decision {
  id: string;
  title: string;
  context: string | null;
  outcome: string | null;
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'REVISED';
  madeAt: string;
  madeBy: string | null;
  reviewDate: string | null;
  notes: string | null;
  signalId: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: Array<{ id: string; title: string; status: string }>;
}

type DecisionStatus = Decision['status'];

const statusLabels: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' }> = {
  PENDING: { label: '待执行', color: 'default' },
  EXECUTING: { label: '执行中', color: 'primary' },
  COMPLETED: { label: '已完成', color: 'success' },
  REVISED: { label: '已修订', color: 'warning' },
};

export default function DecisionsPage() {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<DecisionStatus | 'ALL'>('ALL');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    context: '',
    outcome: '',
    madeBy: '',
    reviewDate: '',
  });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });
  const [stats, setStats] = useState<{
    total: number;
    completed: number;
    executionRate: number;
    avgClosureDays: number | null;
  } | null>(null);

  const loadDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentTab !== 'ALL') {
        params.set('status', currentTab);
      }

      const res = await fetch(`/api/decisions?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      if (data.success) {
        setDecisions(data.data);
        if (data.stats) setStats(data.stats);
      } else {
        throw new Error(data.error || '加载决策列表失败');
      }
    } catch (error) {
      console.error('加载决策列表失败:', error);
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, [currentTab]);

  useEffect(() => {
    loadDecisions();
  }, [loadDecisions]);

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      setSnackbar({ open: true, message: '请填写决策标题', severity: 'error' });
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, string> = { title: formData.title.trim() };
      if (formData.context.trim()) body.context = formData.context.trim();
      if (formData.outcome.trim()) body.outcome = formData.outcome.trim();
      if (formData.madeBy.trim()) body.madeBy = formData.madeBy.trim();
      if (formData.reviewDate) body.reviewDate = formData.reviewDate;

      const res = await fetch('/api/decisions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({ open: true, message: '决策创建成功', severity: 'success' });
        setCreateDialogOpen(false);
        setFormData({ title: '', context: '', outcome: '', madeBy: '', reviewDate: '' });
        loadDecisions();
      } else {
        throw new Error(data.error || '创建失败');
      }
    } catch (error) {
      console.error('创建决策失败:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : '创建失败，请重试',
        severity: 'error',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCloseDialog = () => {
    if (!creating) {
      setCreateDialogOpen(false);
      setFormData({ title: '', context: '', outcome: '', madeBy: '', reviewDate: '' });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '未设置';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <GavelIcon color="primary" />
          <Typography variant="h4">决策日志</Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          新增决策
        </Button>
      </Box>

      {stats && (
        <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.total}</Typography>
            <Typography variant="caption" color="text.secondary">总决策</Typography>
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.main' }}>{stats.executionRate}%</Typography>
            <Typography variant="caption" color="text.secondary">执行率</Typography>
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>{stats.completed}</Typography>
            <Typography variant="caption" color="text.secondary">已完成</Typography>
          </Box>
          {stats.avgClosureDays !== null && (
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>{stats.avgClosureDays}</Typography>
              <Typography variant="caption" color="text.secondary">平均闭环(天)</Typography>
            </Box>
          )}
        </Box>
      )}

      <Tabs
        value={currentTab}
        onChange={(_, value) => setCurrentTab(value)}
        sx={{ mb: 3 }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="全部" value="ALL" />
        <Tab label="待执行" value="PENDING" />
        <Tab label="执行中" value="EXECUTING" />
        <Tab label="已完成" value="COMPLETED" />
        <Tab label="已修订" value="REVISED" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : decisions.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
          暂无决策记录
        </Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            共 {decisions.length} 条决策
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>标题</TableCell>
                  <TableCell>决策人</TableCell>
                  <TableCell>决策时间</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>复盘日期</TableCell>
                  <TableCell align="center">关联任务数</TableCell>
                  <TableCell>执行进度</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {decisions.map((decision) => {
                  const statusInfo = statusLabels[decision.status] || statusLabels.PENDING;
                  return (
                    <TableRow
                      key={decision.id}
                      hover
                      sx={{
                        ...(decision.reviewDate &&
                          new Date(decision.reviewDate) < new Date() &&
                          decision.status !== 'COMPLETED' &&
                          decision.status !== 'REVISED'
                          ? { bgcolor: 'rgba(239, 68, 68, 0.04)' }
                          : {}),
                      }}
                    >
                      <TableCell>
                        <Typography
                          sx={{
                            cursor: 'pointer',
                            fontWeight: 600,
                            '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                          }}
                          onClick={() => router.push(`/decisions/${decision.id}`)}
                        >
                          {decision.title}
                        </Typography>
                      </TableCell>
                      <TableCell>{decision.madeBy || '-'}</TableCell>
                      <TableCell>{formatDate(decision.madeAt)}</TableCell>
                      <TableCell>
                        <Chip
                          label={statusInfo.label}
                          color={statusInfo.color}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            color: decision.reviewDate &&
                              new Date(decision.reviewDate) < new Date() &&
                              decision.status !== 'COMPLETED' &&
                              decision.status !== 'REVISED'
                              ? 'error.main'
                              : 'text.primary',
                            fontWeight: decision.reviewDate &&
                              new Date(decision.reviewDate) < new Date() &&
                              decision.status !== 'COMPLETED' &&
                              decision.status !== 'REVISED'
                              ? 600
                              : 400,
                          }}
                        >
                          {formatDate(decision.reviewDate)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={decision.tasks?.length ?? 0}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const tasks = decision.tasks || [];
                          if (tasks.length === 0) return <Typography variant="caption" color="text.secondary">-</Typography>;
                          const done = tasks.filter((t: any) => t.status === 'DONE').length;
                          const pct = Math.round((done / tasks.length) * 100);
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
                              <LinearProgress
                                variant="determinate"
                                value={pct}
                                sx={{ flex: 1, height: 6, borderRadius: 3 }}
                              />
                              <Typography variant="caption" sx={{ minWidth: 30 }}>{pct}%</Typography>
                            </Box>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Create Decision Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>新增决策</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="决策标题"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="决策背景"
              value={formData.context}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <TextField
              label="预期结果"
              value={formData.outcome}
              onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="决策人"
              value={formData.madeBy}
              onChange={(e) => setFormData({ ...formData, madeBy: e.target.value })}
              fullWidth
            />
            <TextField
              label="复盘日期"
              type="date"
              value={formData.reviewDate}
              onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} disabled={creating}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={creating || !formData.title.trim()}
            startIcon={creating ? <CircularProgress size={18} /> : undefined}
          >
            {creating ? '创建中...' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
