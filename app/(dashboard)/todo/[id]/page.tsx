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
  IconButton
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
      const res = await fetch(`/api/tasks/${taskId}`);
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
      const res = await fetch('/api/assignees');
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

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          dod: formData.dod.trim() || null,
          dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
          status: formData.status,
          assigneeId: formData.assigneeId || null
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

  const handleDelete = async () => {
    if (!confirm('确定要删除这个任务吗？')) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE'
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

          <FormControl fullWidth>
            <InputLabel>负责人</InputLabel>
            <Select
              value={formData.assigneeId}
              label="负责人"
              onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
            >
              <MenuItem value="">
                <em>未分配</em>
              </MenuItem>
              {assignees.map((assignee) => (
                <MenuItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
    </Container>
  );
}
