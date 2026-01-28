'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Box,
  Tabs,
  Tab,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Checkbox,
  ListItemText,
  OutlinedInput,
  Alert,
  Snackbar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import { Add as AddIcon, Send as SendIcon } from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';
import TaskTable from '@/components/TaskTable';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
  dod: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Assignee {
  id: string;
  name: string;
}

type SortOption = 'dueDate-asc' | 'dueDate-desc' | 'createdAt-desc' | 'createdAt-asc';

export default function TodoPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TaskStatus | 'ALL'>('ALL');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>('dueDate-asc');
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });

  // 加载负责人列表
  useEffect(() => {
    const loadAssignees = async () => {
      try {
        const res = await fetch('/api/assignees');
        const data = await res.json();
        if (data.success) {
          setAssignees(data.data);
        }
      } catch (error) {
        console.error('加载负责人失败:', error);
      }
    };
    loadAssignees();
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentTab !== 'ALL') {
        params.set('status', currentTab);
      }
      if (selectedAssignees.length > 0) {
        params.set('assigneeIds', selectedAssignees.join(','));
      }

      const res = await fetch(`/api/tasks?${params}`);
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      if (data.success) {
        setTasks(data.data);
      } else {
        throw new Error(data.error || 'Failed to load tasks');
      }
    } catch (error) {
      console.error('加载任务失败:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [currentTab, selectedAssignees]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());

      loadTasks();
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteDialog({ open: true, taskId: id });
  };

  const handleConfirmDelete = async () => {
    const taskId = deleteDialog.taskId;
    setDeleteDialog({ open: false, taskId: null });

    if (!taskId) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());

      setSnackbar({
        open: true,
        message: '任务已删除',
        severity: 'success'
      });
      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
      setSnackbar({
        open: true,
        message: '删除失败，请重试',
        severity: 'error'
      });
    }
  };

  const handleMarkDone = async (id: string) => {
    await handleStatusChange(id, 'DONE');
  };

  const handleSendToFeishu = async () => {
    if (sortedTasks.length === 0) {
      setSnackbar({
        open: true,
        message: '没有可发送的任务',
        severity: 'error',
      });
      return;
    }

    if (!confirm(`确定要发送 ${sortedTasks.length} 个任务到飞书吗？`)) {
      return;
    }

    setSending(true);
    try {
      const taskIds = sortedTasks.map((task) => task.id);

      const res = await fetch('/api/tasks/send-to-feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({
          open: true,
          message: data.message || '发送成功',
          severity: 'success',
        });
      } else {
        throw new Error(data.error || '发送失败');
      }
    } catch (error) {
      console.error('发送任务到飞书失败:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : '发送失败，请检查飞书配置',
        severity: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  // 客户端排序
  const sortedTasks = [...tasks].sort((a, b) => {
    switch (sortBy) {
      case 'dueDate-asc':
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      case 'dueDate-desc':
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      case 'createdAt-asc':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'createdAt-desc':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      default:
        return 0;
    }
  });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3
        }}
      >
        <Typography variant="h4">📋 To-Do List</Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={sending ? <CircularProgress size={20} /> : <SendIcon />}
            onClick={handleSendToFeishu}
            disabled={sending || sortedTasks.length === 0}
          >
            发送到飞书
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/todo/new')}
          >
            添加任务
          </Button>
        </Stack>
      </Box>

      <Tabs
        value={currentTab}
        onChange={(_, value) => setCurrentTab(value)}
        sx={{ mb: 3 }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="全部" value="ALL" />
        <Tab label="待办" value="TODO" />
        <Tab label="进行中" value="IN_PROGRESS" />
        <Tab label="已完成" value="DONE" />
        <Tab label="已取消" value="CANCELLED" />
        <Tab label="已推迟" value="POSTPONED" />
      </Tabs>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel>负责人</InputLabel>
          <Select
            multiple
            value={selectedAssignees}
            label="负责人"
            onChange={(e) => {
              const value = e.target.value;
              setSelectedAssignees(typeof value === 'string' ? value.split(',') : value);
            }}
            input={<OutlinedInput label="负责人" />}
            renderValue={(selected) => {
              if (selected.length === 0) {
                return '全部';
              }
              return selected
                .map((id) => assignees.find((a) => a.id === id)?.name)
                .filter(Boolean)
                .join(', ');
            }}
          >
            {assignees.map((assignee) => (
              <MenuItem key={assignee.id} value={assignee.id}>
                <Checkbox checked={selectedAssignees.indexOf(assignee.id) > -1} />
                <ListItemText primary={assignee.name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>排序</InputLabel>
          <Select
            value={sortBy}
            label="排序"
            onChange={(e) => setSortBy(e.target.value as SortOption)}
          >
            <MenuItem value="dueDate-asc">截止时间 ↑</MenuItem>
            <MenuItem value="dueDate-desc">截止时间 ↓</MenuItem>
            <MenuItem value="createdAt-desc">创建时间 ↓</MenuItem>
            <MenuItem value="createdAt-asc">创建时间 ↑</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {loading ? (
        <Typography>加载中...</Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            共 {sortedTasks.length} 个任务
          </Typography>
          <TaskTable
            tasks={sortedTasks}
            onEdit={(task) => router.push(`/todo/${task.id}`)}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onMarkDone={handleMarkDone}
          />
        </>
      )}

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, taskId: null })}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除这个任务吗？删除后无法恢复。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, taskId: null })}>
            取消
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" autoFocus>
            删除
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
    </Container>
  );
}
