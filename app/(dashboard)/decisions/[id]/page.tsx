'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Stack,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Save as SaveIcon,
} from '@mui/icons-material';

interface Assignee {
  id: string;
  name: string;
}

interface LinkedTask {
  id: string;
  title: string;
  status: string;
  assignee: Assignee | null;
}

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
  tasks: LinkedTask[];
}

const STATUS_OPTIONS = [
  { value: 'PENDING', label: '待执行' },
  { value: 'EXECUTING', label: '执行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'REVISED', label: '已修订' },
];

const statusChipColors: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  PENDING: 'default',
  EXECUTING: 'primary',
  COMPLETED: 'success',
  REVISED: 'warning',
};

const taskStatusLabels: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'error' | 'warning' }> = {
  TODO: { label: '待办', color: 'default' },
  IN_PROGRESS: { label: '进行中', color: 'primary' },
  DONE: { label: '已完成', color: 'success' },
  CANCELLED: { label: '已取消', color: 'error' },
  POSTPONED: { label: '已推迟', color: 'warning' },
};

export default function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);

  // Editable form fields
  const [formData, setFormData] = useState({
    status: 'PENDING' as string,
    madeBy: '',
    reviewDate: '',
    context: '',
    outcome: '',
    notes: '',
  });

  // Create task dialog
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    dod: '',
    assigneeId: '',
    dueDate: '',
  });

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Resolve params
  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  // Load data when id is available
  useEffect(() => {
    if (id) {
      loadDecision();
      loadAssignees();
    }
  }, [id]);

  const loadDecision = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/decisions/${id}`, { credentials: 'include' });
      const data = await res.json();

      if (res.ok && data.success) {
        const d: Decision = data.data;
        setDecision(d);
        setFormData({
          status: d.status,
          madeBy: d.madeBy || '',
          reviewDate: d.reviewDate ? new Date(d.reviewDate).toISOString().slice(0, 10) : '',
          context: d.context || '',
          outcome: d.outcome || '',
          notes: d.notes || '',
        });
      } else {
        setSnackbar({ open: true, message: '决策不存在', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '加载决策失败', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadAssignees = async () => {
    try {
      const res = await fetch('/api/assignees', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setAssignees(data.data);
      }
    } catch {
      console.error('加载负责人列表失败');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {
        status: formData.status,
        madeBy: formData.madeBy.trim() || null,
        reviewDate: formData.reviewDate || null,
        context: formData.context.trim() || null,
        outcome: formData.outcome.trim() || null,
        notes: formData.notes.trim() || null,
      };

      const res = await fetch(`/api/decisions/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({ open: true, message: '保存成功', severity: 'success' });
        // Update local decision object with new status
        if (decision) {
          setDecision({ ...decision, ...data.data, tasks: decision.tasks });
        }
      } else {
        setSnackbar({ open: true, message: data.error || '保存失败', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '网络错误，请重试', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) {
      setSnackbar({ open: true, message: '请填写任务标题', severity: 'error' });
      return;
    }

    setCreatingTask(true);
    try {
      const body: Record<string, string | null> = {
        title: taskForm.title.trim(),
        dod: taskForm.dod.trim() || null,
        assigneeId: taskForm.assigneeId || null,
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null,
        decisionId: id,
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({ open: true, message: '关联任务创建成功', severity: 'success' });
        setCreateTaskOpen(false);
        setTaskForm({ title: '', dod: '', assigneeId: '', dueDate: '' });
        // Reload to get updated task list
        loadDecision();
      } else {
        setSnackbar({ open: true, message: data.error || '创建任务失败', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '网络错误，请重试', severity: 'error' });
    } finally {
      setCreatingTask(false);
    }
  };

  const handleCloseTaskDialog = () => {
    if (!creatingTask) {
      setCreateTaskOpen(false);
      setTaskForm({ title: '', dod: '', assigneeId: '', dueDate: '' });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  if (loading) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto', display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!decision) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        <Alert severity="error">决策不存在或加载失败</Alert>
      </Box>
    );
  }

  const currentStatusLabel = STATUS_OPTIONS.find(s => s.value === formData.status)?.label || formData.status;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => router.push('/decisions')}
          sx={{ mr: 2 }}
          aria-label="返回"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flex: 1 }}>
          {decision.title}
        </Typography>
      </Box>

      {/* Status section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="body1" color="text.secondary">
          当前状态:
        </Typography>
        <Chip
          label={currentStatusLabel}
          color={statusChipColors[formData.status] || 'default'}
          size="small"
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>切换状态</InputLabel>
          <Select
            value={formData.status}
            label="切换状态"
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
          >
            {STATUS_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Info fields */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          决策信息
        </Typography>
        <Stack spacing={2.5}>
          <TextField
            label="决策人"
            fullWidth
            value={formData.madeBy}
            onChange={(e) => setFormData({ ...formData, madeBy: e.target.value })}
          />

          <TextField
            label="决策时间"
            fullWidth
            value={formatDate(decision.madeAt)}
            slotProps={{ input: { readOnly: true } }}
          />

          <TextField
            label="复盘日期"
            type="date"
            fullWidth
            value={formData.reviewDate}
            onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="决策背景"
            fullWidth
            multiline
            rows={3}
            value={formData.context}
            onChange={(e) => setFormData({ ...formData, context: e.target.value })}
          />

          <TextField
            label="预期结果"
            fullWidth
            multiline
            rows={2}
            value={formData.outcome}
            onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
          />

          <TextField
            label="跟踪备注"
            fullWidth
            multiline
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />

          <Box>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存修改'}
            </Button>
          </Box>
        </Stack>
      </Paper>

      {/* Linked tasks section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            关联任务
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreateTaskOpen(true)}
          >
            创建关联任务
          </Button>
        </Box>

        {decision.tasks.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            暂无关联任务
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>任务标题</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>负责人</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {decision.tasks.map((task) => {
                  const statusInfo = taskStatusLabels[task.status] || taskStatusLabels.TODO;
                  return (
                    <TableRow
                      key={task.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/todo/${task.id}`)}
                    >
                      <TableCell>
                        <Typography
                          sx={{
                            fontWeight: 500,
                            '&:hover': { color: 'primary.main' },
                          }}
                        >
                          {task.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={statusInfo.label}
                          color={statusInfo.color}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{task.assignee?.name || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Create Task Dialog */}
      <Dialog
        open={createTaskOpen}
        onClose={handleCloseTaskDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>创建关联任务</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="任务标题"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label="完成标准 (DoD)"
              value={taskForm.dod}
              onChange={(e) => setTaskForm({ ...taskForm, dod: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <FormControl fullWidth>
              <InputLabel>负责人</InputLabel>
              <Select
                value={taskForm.assigneeId}
                label="负责人"
                onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}
              >
                <MenuItem value="">
                  <em>未指定</em>
                </MenuItem>
                {assignees.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="截止时间"
              type="datetime-local"
              fullWidth
              value={taskForm.dueDate}
              onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseTaskDialog} disabled={creatingTask}>
            取消
          </Button>
          <Button
            onClick={handleCreateTask}
            variant="contained"
            disabled={creatingTask || !taskForm.title.trim()}
            startIcon={creatingTask ? <CircularProgress size={18} /> : undefined}
          >
            {creatingTask ? '创建中...' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
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
