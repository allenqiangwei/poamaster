'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
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
  DialogActions,
  TextField,
  Alert,
  Snackbar
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';

interface Assignee {
  id: string;
  name: string;
  feishuUserId: string | null;
  _count?: {
    tasks: number;
  };
}

export default function AssigneesPage() {
  const router = useRouter();
  const [assignees, setAssignees] = useState<Assignee[]>([]);
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

  useEffect(() => {
    loadAssignees();
  }, []);

  const loadAssignees = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assignees?includeTaskCount=true');
      const data = await res.json();
      if (data.success) {
        setAssignees(data.data);
      }
    } catch (error) {
      console.error('加载负责人失败:', error);
    } finally {
      setLoading(false);
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
        method: editingAssignee ? 'PUT' : 'POST',
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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除负责人"${name}"吗？\n注意：删除后该负责人的任务将变为未分配状态。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/assignees/${id}`, {
        method: 'DELETE'
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

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => router.back()}
          sx={{ mr: 2 }}
          aria-label="返回"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          👥 负责人管理
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          添加负责人
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>姓名</TableCell>
              <TableCell>飞书用户ID</TableCell>
              <TableCell align="right">负责任务数</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : assignees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  暂无负责人，点击"添加负责人"按钮创建
                </TableCell>
              </TableRow>
            ) : (
              assignees.map((assignee) => (
                <TableRow key={assignee.id}>
                  <TableCell>{assignee.name}</TableCell>
                  <TableCell>
                    {assignee.feishuUserId || <em style={{ color: '#999' }}>未设置</em>}
                  </TableCell>
                  <TableCell align="right">
                    {assignee._count?.tasks || 0}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(assignee)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(assignee.id, assignee.name)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

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
    </Container>
  );
}
