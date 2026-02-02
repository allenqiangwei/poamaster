'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Snackbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { STALE_THRESHOLD_DAYS, KEY_DIMENSIONS, DIMENSION_LABELS } from '@/lib/pulse/constants';

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  _count: { entries: number };
}

interface ProjectStats {
  total: number;
  byDimension: Record<string, number>;
}

interface TodoItem {
  title: string;
  dod: string;
  dueDate?: string;
}

export default function PulseProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 默认负责人（强伟）的 ID
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);

  // AI 生成待办事项相关状态
  const [aiDialog, setAiDialog] = useState<{
    open: boolean;
    loading: boolean;
    todos: TodoItem[];
  }>({ open: false, loading: false, todos: [] });

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchProjects();
    fetchDefaultAssignee();
  }, []);

  const fetchDefaultAssignee = async () => {
    try {
      const res = await fetch('/api/assignees', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        // 查找名为"强伟"的负责人
        const qiangwei = data.data.find((a: any) => a.name === '强伟');
        if (qiangwei) {
          setDefaultAssigneeId(qiangwei.id);
        }
      }
    } catch (error) {
      console.error('获取默认负责人失败:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/pulse/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
        // Fetch stats for each project
        for (const project of data.data) {
          const statsRes = await fetch(`/api/pulse/projects/${project.id}/stats`);
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(prev => ({ ...prev, [project.id]: statsData.data }));
          }
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const isStale = (updatedAt: string) => {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceUpdate > STALE_THRESHOLD_DAYS;
  };

  const getDaysSinceUpdate = (updatedAt: string) => {
    return Math.floor(
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  // 生成 AI 待办事项
  const handleGenerateTodos = async () => {
    setAiDialog({ open: true, loading: true, todos: [] });

    try {
      const res = await fetch('/api/pulse/generate-todos', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setAiDialog({
          open: true,
          loading: false,
          todos: data.data.todos
        });
      } else {
        setSnackbar({
          open: true,
          message: data.error || '生成失败',
          severity: 'error'
        });
        setAiDialog({ open: false, loading: false, todos: [] });
      }
    } catch (error) {
      console.error('生成待办事项失败:', error);
      setSnackbar({
        open: true,
        message: '生成失败，请稍后重试',
        severity: 'error'
      });
      setAiDialog({ open: false, loading: false, todos: [] });
    }
  };

  // 更新待办事项
  const handleUpdateTodo = (index: number, field: keyof TodoItem, value: string) => {
    setAiDialog((prev) => ({
      ...prev,
      todos: prev.todos.map((todo, i) =>
        i === index ? { ...todo, [field]: value } : todo
      )
    }));
  };

  // 删除待办事项
  const handleDeleteTodo = (index: number) => {
    setAiDialog((prev) => ({
      ...prev,
      todos: prev.todos.filter((_, i) => i !== index)
    }));
  };

  // 确认并批量创建待办事项
  const handleConfirmTodos = async () => {
    if (aiDialog.todos.length === 0) {
      setSnackbar({
        open: true,
        message: '没有可创建的待办事项',
        severity: 'error'
      });
      return;
    }

    // 验证所有待办事项都有标题
    const emptyTitles = aiDialog.todos.filter(todo => !todo.title.trim());
    if (emptyTitles.length > 0) {
      setSnackbar({
        open: true,
        message: '请填写所有待办事项的标题',
        severity: 'error'
      });
      return;
    }

    setAiDialog((prev) => ({ ...prev, loading: true }));

    try {
      // 批量创建任务
      const createPromises = aiDialog.todos.map(async (todo) => {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: todo.title,
            dod: todo.dod || null,
            dueDate: todo.dueDate ? new Date(todo.dueDate).toISOString() : null,
            status: 'TODO',
            assigneeId: defaultAssigneeId // 默认分配给强伟
          })
        });

        if (!res.ok) {
          throw new Error(`创建任务失败: ${todo.title}`);
        }

        return res.json();
      });

      await Promise.all(createPromises);

      setSnackbar({
        open: true,
        message: `成功创建 ${aiDialog.todos.length} 个待办事项`,
        severity: 'success'
      });

      setAiDialog({ open: false, loading: false, todos: [] });

      // 可选：跳转到 todo list 页面
      setTimeout(() => {
        router.push('/todo');
      }, 1500);
    } catch (error) {
      console.error('创建待办事项失败:', error);
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : '创建失败，请稍后重试',
        severity: 'error'
      });
      setAiDialog((prev) => ({ ...prev, loading: false }));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">项目管理</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleGenerateTodos}
            disabled={projects.length === 0}
          >
            AI 生成待办事项
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/pulse/new')}
          >
            新建项目
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {projects.length === 0 ? (
        <Alert severity="info">暂无项目，点击右上角创建第一个项目</Alert>
      ) : (
        <Grid container spacing={3}>
          {projects.map((project) => {
            const projectStats = stats[project.id];
            const stale = isStale(project.updatedAt);
            const daysSince = getDaysSinceUpdate(project.updatedAt);

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={project.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 4 },
                    border: stale ? '1px solid orange' : undefined,
                  }}
                  onClick={() => router.push(`/pulse/${project.id}`)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="h6" gutterBottom>
                        {project.name}
                      </Typography>
                      {stale && (
                        <Chip
                          icon={<WarningAmberIcon />}
                          label={`${daysSince}天未更新`}
                          color="warning"
                          size="small"
                        />
                      )}
                    </Box>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      最后更新: {new Date(project.updatedAt).toLocaleString('zh-CN')}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                      {projectStats && KEY_DIMENSIONS.map((dim) => (
                        <Chip
                          key={dim}
                          label={`${DIMENSION_LABELS[dim]}: ${projectStats.byDimension[dim] || 0}`}
                          size="small"
                          color={projectStats.byDimension[dim] > 0 ? 'primary' : 'default'}
                          variant="outlined"
                        />
                      ))}
                      <Chip
                        label={`总计: ${projectStats?.total || 0}`}
                        size="small"
                        variant="filled"
                      />
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={(e) => { e.stopPropagation(); router.push(`/pulse/${project.id}`); }}>
                      进入
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* AI 生成待办事项审核对话框 */}
      <Dialog
        open={aiDialog.open}
        onClose={() => !aiDialog.loading && setAiDialog({ open: false, loading: false, todos: [] })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          审核 AI 生成的待办事项
          {!aiDialog.loading && (
            <Typography variant="caption" color="text.secondary" display="block">
              请审核并编辑待办事项，确认后将添加到 To-Do List
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {aiDialog.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>AI 正在分析项目状态...</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {aiDialog.todos.map((todo, index) => (
                <Card key={index} variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                      <Box sx={{ flexGrow: 1 }}>
                        <TextField
                          fullWidth
                          label="任务标题"
                          value={todo.title}
                          onChange={(e) => handleUpdateTodo(index, 'title', e.target.value)}
                          size="small"
                          sx={{ mb: 2 }}
                          required
                        />
                        <TextField
                          fullWidth
                          label="完成标准 (DOD)"
                          value={todo.dod}
                          onChange={(e) => handleUpdateTodo(index, 'dod', e.target.value)}
                          size="small"
                          multiline
                          rows={2}
                          sx={{ mb: 2 }}
                        />
                        <TextField
                          fullWidth
                          label="截止日期"
                          type="date"
                          value={todo.dueDate || ''}
                          onChange={(e) => handleUpdateTodo(index, 'dueDate', e.target.value)}
                          size="small"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Box>
                      <IconButton
                        color="error"
                        onClick={() => handleDeleteTodo(index)}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              ))}

              {aiDialog.todos.length === 0 && (
                <Alert severity="info">
                  没有待办事项。AI 未能生成建议，或所有建议已被删除。
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAiDialog({ open: false, loading: false, todos: [] })}
            disabled={aiDialog.loading}
          >
            取消
          </Button>
          <Button
            variant="contained"
            startIcon={<CheckCircleIcon />}
            onClick={handleConfirmTodos}
            disabled={aiDialog.loading || aiDialog.todos.length === 0}
          >
            {aiDialog.loading ? '创建中...' : `确认创建 (${aiDialog.todos.length})`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar 通知 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
