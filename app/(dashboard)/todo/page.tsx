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
  Typography
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';
import TaskTable from '@/components/TaskTable';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
}

export default function TodoPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TaskStatus | 'ALL'>('ALL');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentTab !== 'ALL') {
        params.set('status', currentTab);
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
  }, [currentTab]);

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

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());

      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
    }
  };

  const handleMarkDone = async (id: string) => {
    await handleStatusChange(id, 'DONE');
  };

  const getTaskCountByStatus = (status: TaskStatus | 'ALL') => {
    if (status === 'ALL') return tasks.length;
    return tasks.filter((t) => t.status === status).length;
  };

  const filteredTasks =
    currentTab === 'ALL'
      ? tasks
      : tasks.filter((t) => t.status === currentTab);

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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/todo/new')}
        >
          添加任务
        </Button>
      </Box>

      <Tabs
        value={currentTab}
        onChange={(_, value) => setCurrentTab(value)}
        sx={{ mb: 3 }}
      >
        <Tab label={`全部 (${getTaskCountByStatus('ALL')})`} value="ALL" />
        <Tab label={`待办 (${getTaskCountByStatus('TODO')})`} value="TODO" />
        <Tab
          label={`进行中 (${getTaskCountByStatus('IN_PROGRESS')})`}
          value="IN_PROGRESS"
        />
        <Tab label={`已完成 (${getTaskCountByStatus('DONE')})`} value="DONE" />
        <Tab
          label={`已取消 (${getTaskCountByStatus('CANCELLED')})`}
          value="CANCELLED"
        />
        <Tab
          label={`已推迟 (${getTaskCountByStatus('POSTPONED')})`}
          value="POSTPONED"
        />
      </Tabs>

      {loading ? (
        <Typography>加载中...</Typography>
      ) : (
        <TaskTable
          tasks={filteredTasks}
          onEdit={(task) => router.push(`/todo/${task.id}`)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onMarkDone={handleMarkDone}
        />
      )}
    </Container>
  );
}
