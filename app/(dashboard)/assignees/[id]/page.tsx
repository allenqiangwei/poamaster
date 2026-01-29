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
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  UploadFile as UploadFileIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';

interface Task {
  id: string;
  title: string;
  dod: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
}

interface Assignee {
  id: string;
  name: string;
  feishuUserId: string | null;
  tasks: Task[];
  _count: {
    tasks: number;
  };
}

interface AssigneeDetailPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  DONE: '已完成',
  CANCELLED: '已取消',
  POSTPONED: '已推迟',
};

const STATUS_COLORS: Record<TaskStatus, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  TODO: 'default',
  IN_PROGRESS: 'primary',
  DONE: 'success',
  CANCELLED: 'error',
  POSTPONED: 'warning',
};

function UploadDialog({
  assigneeId,
  open,
  onClose,
}: {
  assigneeId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setProgress(10);

    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assigneeId', assigneeId);

      setProgress(30);
      const uploadResponse = await fetch('/api/insights/upload', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error(uploadData.error || '上传失败');
      }

      setProgress(60);

      // Step 2: Extract items
      const extractResponse = await fetch('/api/insights/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactId: uploadData.artifactId }),
      });

      const extractData = await extractResponse.json();

      if (!extractData.success) {
        throw new Error(extractData.error || '提取失败');
      }

      setProgress(100);

      // Step 3: Redirect to review page
      router.push(`/insights/review/${uploadData.artifactId}`);
    } catch (error) {
      console.error('Upload error:', error);
      setError(error instanceof Error ? error.message : '上传失败');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFile(null);
      setError(null);
      setProgress(0);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>上传对话文件</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 2 }}>
          <input
            type="file"
            accept=".txt,.pdf,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={loading}
            style={{ width: '100%' }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            支持的格式: .txt, .pdf, .docx
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              {progress < 40 ? '上传中...' : progress < 80 ? '提取中...' : '处理完成'}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={!file || loading}
          startIcon={<UploadFileIcon />}
        >
          {loading ? '处理中...' : '上传并提取'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AssigneeDetailPage({ params }: AssigneeDetailPageProps) {
  const router = useRouter();
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    const loadParams = async () => {
      const resolvedParams = await params;
      setAssigneeId(resolvedParams.id);
    };
    loadParams();
  }, [params]);

  useEffect(() => {
    if (assigneeId) {
      loadAssignee();
    }
  }, [assigneeId]);

  const loadAssignee = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assignees/${assigneeId}`, { credentials: 'include' });
      const data = await res.json();

      if (res.ok && data.success) {
        setAssignee(data.data);
      } else {
        setSnackbar({
          open: true,
          message: '负责人不存在',
          severity: 'error',
        });
      }
    } catch (error) {
      console.error('加载负责人失败:', error);
      setSnackbar({
        open: true,
        message: '加载失败',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography>加载中...</Typography>
      </Container>
    );
  }

  if (!assignee) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">负责人不存在</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => router.back()} sx={{ mr: 2 }} aria-label="返回">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" gutterBottom>
            {assignee.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {assignee.feishuUserId && (
              <Typography variant="body2" color="text.secondary">
                飞书ID: <strong>{assignee.feishuUserId}</strong>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              任务数: <strong>{assignee._count.tasks}</strong>
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={() => setUploadDialogOpen(true)}
          size="large"
        >
          上传对话
        </Button>
      </Box>

      {/* Tasks Table */}
      <Paper sx={{ mt: 3 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">任务列表</Typography>
        </Box>
        {assignee.tasks.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              暂无任务
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>标题</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>截止时间</TableCell>
                  <TableCell>创建时间</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignee.tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Typography variant="body2">{task.title}</Typography>
                      {task.dod && (
                        <Typography variant="caption" color="text.secondary">
                          {task.dod}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[task.status]}
                        color={STATUS_COLORS[task.status]}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{formatDate(task.dueDate)}</TableCell>
                    <TableCell>{formatDate(task.createdAt)}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => router.push(`/todo/${task.id}`)}
                        color="primary"
                      >
                        <EditIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Upload Dialog */}
      <UploadDialog
        assigneeId={assignee.id}
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
