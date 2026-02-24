'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Paper,
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Alert,
  Snackbar,
  Card,
  CardContent,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  AutoAwesome as AutoAwesomeIcon,
  CheckCircle as CheckCircleIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

interface Assignee {
  id: string;
  name: string;
  feishuUserId: string | null;
  _count?: {
    tasks: number;
  };
}

interface TodoItem {
  title: string;
  dod: string;
  dueDate?: string;
}

export default function AssigneesPage() {
  const router = useRouter();
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssignee, setEditingAssignee] = useState<Assignee | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    feishuUserId: ''
  });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    assigneeId: string | null;
    assigneeName: string;
  }>({ open: false, assigneeId: null, assigneeName: '' });

  // Sort state — default: most tasks first
  const [sortField, setSortField] = useState<string>('tasks');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // 默认负责人（强伟）的 ID
  const [defaultAssigneeId, setDefaultAssigneeId] = useState<string | null>(null);

  // AI 生成待办事项相关状态
  const [aiDialog, setAiDialog] = useState<{
    open: boolean;
    loading: boolean;
    todos: TodoItem[];
  }>({ open: false, loading: false, todos: [] });

  useEffect(() => {
    loadAssignees();
  }, []);

  // Fetch profiles in parallel after assignees load
  useEffect(() => {
    if (assignees.length === 0) return;
    assignees.forEach((a) => {
      fetch(`/api/assignees/${a.id}/profile`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setProfiles((prev) => ({ ...prev, [a.id]: d.data }));
          }
        })
        .catch(() => {});
    });
  }, [assignees]);

  const loadAssignees = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assignees?includeTaskCount=true', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setAssignees(data.data);
        // 查找"强伟"作为默认负责人
        const qiangwei = data.data.find((a: Assignee) => a.name === '强伟');
        if (qiangwei) {
          setDefaultAssigneeId(qiangwei.id);
        }
      }
    } catch (error) {
      console.error('加载负责人失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 生成 AI 待办事项
  const handleGenerateTodos = async () => {
    setAiDialog({ open: true, loading: true, todos: [] });

    try {
      const res = await fetch('/api/assignees/generate-todos', {
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

      // 跳转到 todo list 页面
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

  const handleOpenDialog = (assignee?: Assignee) => {
    if (assignee) {
      setEditingAssignee(assignee);
      setFormData({
        name: assignee.name,
        feishuUserId: assignee.feishuUserId || ''
      });
    } else {
      setEditingAssignee(null);
      setFormData({
        name: '',
        feishuUserId: ''
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAssignee(null);
    setFormData({ name: '', feishuUserId: '' });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setSnackbar({
        open: true,
        message: '请输入负责人姓名',
        severity: 'error'
      });
      return;
    }

    try {
      const url = editingAssignee
        ? `/api/assignees/${editingAssignee.id}`
        : '/api/assignees';

      const res = await fetch(url, {
        method: editingAssignee ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          feishuUserId: formData.feishuUserId.trim() || null
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({
          open: true,
          message: editingAssignee ? '更新成功' : '添加成功',
          severity: 'success'
        });
        handleCloseDialog();
        loadAssignees();
      } else {
        throw new Error(data.error || '操作失败');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : '操作失败',
        severity: 'error'
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteDialog({ open: true, assigneeId: id, assigneeName: name });
  };

  const handleConfirmDelete = async () => {
    const { assigneeId } = deleteDialog;
    setDeleteDialog({ open: false, assigneeId: null, assigneeName: '' });

    if (!assigneeId) return;

    try {
      const res = await fetch(`/api/assignees/${assigneeId}`, {
        method: 'DELETE',
        credentials: "include"
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({
          open: true,
          message: '删除成功',
          severity: 'success'
        });
        loadAssignees();
      } else {
        throw new Error(data.error || '删除失败');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: error instanceof Error ? error.message : '删除失败',
        severity: 'error'
      });
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedAssignees = [...assignees].sort((a, b) => {
    let va: number, vb: number;
    const pa = profiles[a.id];
    const pb = profiles[b.id];

    switch (sortField) {
      case 'tasks':
        va = a._count?.tasks || 0;
        vb = b._count?.tasks || 0;
        break;
      case 'messages':
        va = pa?.messageCount ?? -1;
        vb = pb?.messageCount ?? -1;
        break;
      case 'chats':
        va = pa?.activeChatCount ?? -1;
        vb = pb?.activeChatCount ?? -1;
        break;
      case 'completion':
        va = pa?.completionRate ?? -1;
        vb = pb?.completionRate ?? -1;
        break;
      case 'signals':
        va = pa?.unresolvedSignals ?? -1;
        vb = pb?.unresolvedSignals ?? -1;
        break;
      case 'name':
        return sortDir === 'asc'
          ? a.name.localeCompare(b.name, 'zh-CN')
          : b.name.localeCompare(a.name, 'zh-CN');
      default:
        va = a._count?.tasks || 0;
        vb = b._count?.tasks || 0;
    }
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const SortHeader = ({ field, label, align, sx: cellSx }: { field: string; label: string; align?: 'right' | 'left'; sx?: any }) => (
    <TableCell
      align={align}
      sx={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...cellSx }}
      onClick={() => handleSort(field)}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {label}
        {sortField === field ? (
          sortDir === 'asc' ? <ArrowUpIcon sx={{ fontSize: 16, opacity: 0.8 }} /> : <ArrowDownIcon sx={{ fontSize: 16, opacity: 0.8 }} />
        ) : (
          <ArrowDownIcon sx={{ fontSize: 16, opacity: 0.2 }} />
        )}
      </Box>
    </TableCell>
  );

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            onClick={() => router.back()}
            sx={{ mr: 1 }}
            aria-label="返回"
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            负责人管理
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', ml: { xs: 0, sm: 'auto' } }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleGenerateTodos}
            disabled={assignees.length === 0}
          >
            AI 生成待办
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            添加负责人
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>加载中...</Box>
      ) : assignees.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>暂无负责人，点击"添加负责人"按钮创建</Box>
      ) : isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sortedAssignees.map((assignee) => (
            <Card
              key={assignee.id}
              sx={{ cursor: 'pointer' }}
              onClick={() => router.push(`/assignees/${assignee.id}`)}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Typography sx={{ color: 'primary.main', fontWeight: 600 }}>
                    {assignee.name}
                  </Typography>
                  <Box onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenDialog(assignee); }} color="primary">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(assignee.id, assignee.name); }} color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip label={`${assignee._count?.tasks || 0} 任务`} size="small" variant="outlined" />
                  {profiles[assignee.id]?.messageCount != null && (
                    <Chip label={`${profiles[assignee.id].messageCount} 消息`} size="small" variant="outlined" />
                  )}
                  {profiles[assignee.id]?.completionRate != null && (
                    <Chip label={`完成率 ${profiles[assignee.id].completionRate}%`} size="small" variant="outlined" />
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <SortHeader field="name" label="姓名" />
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>飞书用户ID</TableCell>
                <SortHeader field="tasks" label="负责任务数" align="right" />
                <SortHeader field="messages" label="本周消息" align="right" />
                <SortHeader field="chats" label="活跃群数" align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }} />
                <SortHeader field="completion" label="完成率" align="right" />
                <SortHeader field="signals" label="活跃信号" align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }} />
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedAssignees.map((assignee) => (
                <TableRow
                  key={assignee.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/assignees/${assignee.id}`)}
                >
                  <TableCell>
                    <Typography sx={{ color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}>
                      {assignee.name}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {assignee.feishuUserId || <em style={{ color: '#64748b' }}>未设置</em>}
                  </TableCell>
                  <TableCell align="right">{assignee._count?.tasks || 0}</TableCell>
                  <TableCell align="right">{profiles[assignee.id]?.messageCount ?? '-'}</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {profiles[assignee.id]?.activeChatCount ?? '-'}
                  </TableCell>
                  <TableCell align="right">
                    {profiles[assignee.id]?.completionRate != null ? `${profiles[assignee.id].completionRate}%` : '-'}
                  </TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                    {profiles[assignee.id]?.unresolvedSignals ?? '-'}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenDialog(assignee); }} color="primary">
                      <EditIcon />
                    </IconButton>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(assignee.id, assignee.name); }} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingAssignee ? '编辑负责人' : '添加负责人'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="姓名"
              fullWidth
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="张三"
            />
            <TextField
              label="飞书用户ID"
              fullWidth
              value={formData.feishuUserId}
              onChange={(e) => setFormData({ ...formData, feishuUserId: e.target.value })}
              placeholder="选填，用于飞书通知"
              helperText="用于在飞书消息中 @提醒该负责人"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button onClick={handleSave} variant="contained">
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, assigneeId: null, assigneeName: '' })}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除负责人 <strong>"{deleteDialog.assigneeName}"</strong> 吗？
            <br />
            <br />
            注意：删除后该负责人的任务将变为未分配状态。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, assigneeId: null, assigneeName: '' })}>
            取消
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" autoFocus>
            删除
          </Button>
        </DialogActions>
      </Dialog>

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
              基于负责人洞察和任务生成，请审核并编辑后确认
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {aiDialog.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>AI 正在分析负责人状态...</Typography>
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

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
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
