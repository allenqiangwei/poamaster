'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';

interface Assignee {
  id: string;
  name: string;
}

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

export default function EditTaskPage({ params }: TaskPageProps) {
  const router = useRouter();
  const [taskId, setTaskId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [assigneeInput, setAssigneeInput] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    assigneeName: string;
  }>({ open: false, assigneeName: '' });
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    dod: '',
    dueDate: '',
    status: 'TODO' as TaskStatus,
    assigneeId: ''
  });

  useEffect(() => {
    const loadParams = async () => {
      const resolvedParams = await params;
      setTaskId(resolvedParams.id);
    };
    loadParams();
  }, [params]);

  useEffect(() => {
    if (taskId) {
      loadTask();
      loadAssignees();
    }
  }, [taskId]);

  const loadTask = async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { credentials: 'include' });
      const data = await res.json();

      if (res.ok && data.success) {
        const task = data.data;
        setFormData({
          title: task.title,
          dod: task.dod || '',
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '',
          status: task.status,
          assigneeId: task.assigneeId || ''
        });
        // 设置负责人输入框的初始值
        setAssigneeInput(task.assignee?.name || '');
      } else {
        setError('任务不存在');
      }
    } catch (err) {
      setError('加载任务失败');
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
    } catch (err) {
      console.error('加载负责人失败:', err);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      setError('请输入任务标题');
      return;
    }

    // 检查负责人输入
    const trimmedAssigneeName = assigneeInput.trim();
    let finalAssigneeId = formData.assigneeId;

    if (trimmedAssigneeName) {
      // 查找负责人是否存在
      const existingAssignee = assignees.find(
        (a) => a.name.toLowerCase() === trimmedAssigneeName.toLowerCase()
      );

      if (existingAssignee) {
        // 负责人已存在，使用其 ID
        finalAssigneeId = existingAssignee.id;
      } else {
        // 负责人不存在，弹出确认对话框
        setConfirmDialog({
          open: true,
          assigneeName: trimmedAssigneeName
        });
        return; // 等待用户确认
      }
    } else {
      // 没有输入负责人，设为 null
      finalAssigneeId = '';
    }

    // 保存任务
    await saveTask(finalAssigneeId);
  };

  const handleConfirmCreateAssignee = async () => {
    const newAssigneeName = confirmDialog.assigneeName;
    setConfirmDialog({ open: false, assigneeName: '' });

    try {
      // 创建新负责人
      const createRes = await fetch('/api/assignees', {
        method: 'POST',
        credentials: "include",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAssigneeName })
      });

      const createData = await createRes.json();

      if (createRes.ok && createData.success) {
        const newAssigneeId = createData.data.id;
        // 添加到本地列表
        setAssignees([...assignees, createData.data]);
        // 保存任务
        await saveTask(newAssigneeId);
      } else {
        setError(createData.error || '创建负责人失败');
      }
    } catch (err) {
      setError('创建负责人失败');
    }
  };

  const saveTask = async (assigneeId: string) => {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        credentials: "include",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          dod: formData.dod.trim() || null,
          dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
          status: formData.status,
          assigneeId: assigneeId || null
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push('/todo');
      } else {
        setError(data.error || '保存失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    setDeleteDialog(false);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        credentials: "include"
      });

      if (res.ok) {
        router.push('/todo');
      } else {
        setError('删除失败');
      }
    } catch (err) {
      setError('删除失败');
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>加载中...</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => router.back()}
          sx={{ mr: 2 }}
          aria-label="返回"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">
          编辑任务
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label="任务标题"
            fullWidth
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="例如：完成用户认证模块开发"
          />

          <TextField
            label="完成标准 (DoD)"
            fullWidth
            multiline
            rows={3}
            value={formData.dod}
            onChange={(e) => setFormData({ ...formData, dod: e.target.value })}
            placeholder="例如：代码通过测试并部署到测试环境"
          />

          <TextField
            label="截止时间"
            type="datetime-local"
            fullWidth
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />

          <FormControl fullWidth>
            <InputLabel>状态</InputLabel>
            <Select
              value={formData.status}
              label="状态"
              onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })}
            >
              <MenuItem value="TODO">待办</MenuItem>
              <MenuItem value="IN_PROGRESS">进行中</MenuItem>
              <MenuItem value="DONE">已完成</MenuItem>
              <MenuItem value="CANCELLED">已取消</MenuItem>
              <MenuItem value="POSTPONED">已推迟</MenuItem>
            </Select>
          </FormControl>

          <Autocomplete
            freeSolo
            options={assignees.map((a) => a.name)}
            value={assigneeInput}
            onInputChange={(_, newValue) => {
              setAssigneeInput(newValue);
              // 如果输入的名字匹配现有负责人，更新 assigneeId
              const matchedAssignee = assignees.find(
                (a) => a.name.toLowerCase() === newValue.toLowerCase()
              );
              if (matchedAssignee) {
                setFormData({ ...formData, assigneeId: matchedAssignee.id });
              } else {
                setFormData({ ...formData, assigneeId: '' });
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="负责人"
                placeholder="选择或输入负责人名字"
                helperText="可以输入新的负责人名字，保存时会提示创建"
              />
            )}
          />

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存'}
              </Button>
              <Button variant="outlined" onClick={() => router.back()}>
                取消
              </Button>
            </Box>
            <Button
              variant="outlined"
              color="error"
              onClick={handleDelete}
            >
              删除任务
            </Button>
          </Box>
        </Box>
      </Paper>

      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false, assigneeName: '' })}
      >
        <DialogTitle>创建新负责人</DialogTitle>
        <DialogContent>
          <DialogContentText>
            负责人 <strong>"{confirmDialog.assigneeName}"</strong> 不存在。
            <br />
            是否创建该负责人？
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, assigneeName: '' })}>
            取消
          </Button>
          <Button onClick={handleConfirmCreateAssignee} variant="contained" autoFocus>
            创建并保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialog}
        onClose={() => setDeleteDialog(false)}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除这个任务吗？删除后无法恢复。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>
            取消
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" autoFocus>
            删除
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
