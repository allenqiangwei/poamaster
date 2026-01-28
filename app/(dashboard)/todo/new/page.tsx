'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress
} from '@mui/material';
import { ExtractedTask } from '@/lib/openai';
import TaskPreviewTable from '@/components/TaskPreviewTable';

export default function NewTaskPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);

  const handleExtract = async () => {
    if (!text.trim()) {
      setError('请输入要提取的文本内容');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tasks/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.tasks.length === 0) {
          setError('未识别到任务，请检查输入内容');
        } else {
          setExtractedTasks(data.tasks);
        }
      } else {
        setError(data.error || '提取失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      // 批量创建任务
      for (const task of extractedTasks) {
        let assigneeId: string | undefined = undefined;

        // 如果有负责人，先查找或创建负责人记录
        if (task.assignee && task.assignee.trim().length > 0) {
          // 查找负责人
          const assigneesRes = await fetch('/api/assignees');
          const assigneesData = await assigneesRes.json();

          if (assigneesRes.ok && assigneesData.success) {
            const existingAssignee = assigneesData.data.find(
              (a: any) => a.name === task.assignee
            );

            if (existingAssignee) {
              assigneeId = existingAssignee.id;
            } else {
              // 负责人不存在，创建新的负责人
              const createAssigneeRes = await fetch('/api/assignees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: task.assignee })
              });

              const createAssigneeData = await createAssigneeRes.json();
              if (createAssigneeRes.ok && createAssigneeData.success) {
                assigneeId = createAssigneeData.data.id;
              }
            }
          }
        }

        // 创建任务
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            dod: task.dod,
            dueDate: task.dueDate,
            status: 'TODO',
            assigneeId
          })
        });

        if (!res.ok) {
          throw new Error('Failed to create task');
        }
      }

      router.push('/todo');
    } catch {
      setError('保存任务失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        AI 提取任务
      </Typography>

      {extractedTasks.length === 0 ? (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            粘贴文本内容
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            支持从会议记录、邮件、备忘录等文本中提取任务
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            multiline
            rows={10}
            fullWidth
            placeholder="例如：
明天下午3点前，张三需要完成用户认证模块的开发，要求代码通过测试并部署。
李四负责提交项目周报，截止今天下午5点。
王五本周内完成数据库设计文档。"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleExtract}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '提取任务'}
            </Button>
            <Button variant="outlined" onClick={() => router.back()}>
              取消
            </Button>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            提取结果（共 {extractedTasks.length} 个任务）
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            请检查并修改提取的任务信息
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TaskPreviewTable
            tasks={extractedTasks}
            onChange={setExtractedTasks}
          />

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '保存所有任务'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => setExtractedTasks([])}
            >
              重新提取
            </Button>
          </Box>
        </Box>
      )}
    </Container>
  );
}
