'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Paper,
  Typography,
  Button,
  Box,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  Chip,
  Snackbar,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Skeleton,
  alpha,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  UploadFile as UploadFileIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlaylistAdd as AddToTodoIcon,
  AutoAwesome as InsightIcon,
  TextFields as TextFieldsIcon,
  VisibilityOff as HideIcon,
  Visibility as ShowIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import { useResponsive } from '@/hooks/useResponsive';
import TaskStatusChip from '@/components/TaskStatusChip';
import { TaskStatus } from '@prisma/client';
import ModelSelectionDialog from '@/components/ModelSelectionDialog';

interface Task {
  id: string;
  title: string;
  dod: string | null;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
}

interface ConfirmedItem {
  id: string;
  dimension: string;
  content: string;
  sourceText: string | null;
  createdAt: string;
}

interface Assignee {
  id: string;
  name: string;
  feishuUserId: string | null;
  tasks: Task[];
  confirmedItems: ConfirmedItem[];
  _count: {
    tasks: number;
    confirmedItems: number;
  };
}

interface AssigneeProfile {
  messageCount: number;
  activeChatCount: number;
  completionRate: number;
  taskCountByStatus: Record<string, number>;
  unresolvedSignals: number;
  sentimentTrend: { date: string; sentiment: number }[];
}

interface AssigneeDetailPageProps {
  params: Promise<{ id: string }>;
}

// STATUS_LABELS and STATUS_COLORS removed — now using TaskStatusChip component

const DIMENSION_LABELS: Record<string, string> = {
  focus: '当前关注',
  goal: '目标',
  obstacle: '障碍',
  decision: '决策',
  risk: '风险',
  action: '行动',
};

const DIMENSION_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info'> = {
  focus: 'primary',
  goal: 'success',
  obstacle: 'error',
  decision: 'info',
  risk: 'warning',
  action: 'secondary',
};

const DIMENSION_ORDER = ['focus', 'goal', 'obstacle', 'decision', 'risk', 'action'];

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
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');

  const allowedTypes = ['.txt', '.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp'];
  const allowedMimeTypes = [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];

  const validateFile = (file: File): boolean => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    return allowedTypes.includes(extension) || allowedMimeTypes.includes(file.type);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (loading) return;

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && validateFile(droppedFile)) {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('不支持的文件格式，请上传 .txt, .pdf, .docx 或图片文件');
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (loading) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // 检查是否是图片
      if (item.type.startsWith('image/')) {
        e.preventDefault();

        const blob = item.getAsFile();
        if (blob) {
          // 从 blob 创建 File 对象，添加合适的文件名
          const extension = item.type.split('/')[1];
          const fileName = `pasted-image-${Date.now()}.${extension}`;
          const file = new File([blob], fileName, { type: item.type });

          if (validateFile(file)) {
            setFile(file);
            setError(null);
          } else {
            setError('不支持的图片格式');
          }
        }
        break;
      }
    }
  };

  // 添加和移除粘贴事件监听器
  useEffect(() => {
    if (open) {
      window.addEventListener('paste', handlePaste);
      return () => {
        window.removeEventListener('paste', handlePaste);
      };
    }
  }, [open, loading]);

  const handleUpload = async () => {
    // 验证输入
    if (inputMode === 'file' && !file) {
      setError('请选择文件');
      return;
    }
    if (inputMode === 'text' && !textInput.trim()) {
      setError('请输入对话内容');
      return;
    }

    // 显示模型选择对话框
    setShowModelDialog(true);
  };

  const handleModelConfirm = async (model: string) => {
    setSelectedModel(model);
    setLoading(true);
    setError(null);
    setProgress(10);

    try {
      // 如果是文本模式，创建一个 txt 文件
      let uploadFile = file;
      if (inputMode === 'text') {
        const blob = new Blob([textInput], { type: 'text/plain' });
        uploadFile = new File([blob], `conversation-${Date.now()}.txt`, { type: 'text/plain' });
      }

      if (!uploadFile) return;

      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', uploadFile);
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
        body: JSON.stringify({
          artifactId: uploadData.artifactId,
          model: model
        }),
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
      setTextInput('');
      setError(null);
      setProgress(0);
      setIsDragging(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>上传对话</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* 输入模式切换 */}
        <ToggleButtonGroup
          value={inputMode}
          exclusive
          onChange={(_, newMode) => {
            if (newMode && !loading) {
              setInputMode(newMode);
              setError(null);
            }
          }}
          fullWidth
          sx={{ mt: 2, mb: 3 }}
        >
          <ToggleButton value="file">
            <UploadFileIcon sx={{ mr: 1 }} />
            上传文件
          </ToggleButton>
          <ToggleButton value="text">
            <TextFieldsIcon sx={{ mr: 1 }} />
            直接输入
          </ToggleButton>
        </ToggleButtonGroup>

        {/* 文件上传模式 */}
        {inputMode === 'file' && (
          <Box
          sx={{
            mt: 2,
            p: 4,
            border: '2px dashed',
            borderColor: isDragging ? 'primary.main' : file ? 'success.main' : 'divider',
            borderRadius: 2,
            bgcolor: isDragging ? 'rgba(96,165,250,0.06)' : file ? 'rgba(74,222,128,0.06)' : 'transparent',
            textAlign: 'center',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: loading ? 'divider' : 'primary.main',
              bgcolor: loading ? 'transparent' : 'rgba(96,165,250,0.06)',
            },
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => {
            if (!loading) {
              document.getElementById('file-upload-input')?.click();
            }
          }}
        >
          <input
            id="file-upload-input"
            type="file"
            accept=".txt,.pdf,.docx,.jpg,.jpeg,.png,.webp"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile && validateFile(selectedFile)) {
                setFile(selectedFile);
                setError(null);
              } else if (selectedFile) {
                setError('不支持的文件格式');
              }
            }}
            disabled={loading}
            style={{ display: 'none' }}
          />
          <UploadFileIcon sx={{ fontSize: 48, color: isDragging ? 'primary.main' : file ? 'success.main' : 'text.secondary', mb: 1 }} />
          {file ? (
            <>
              <Typography variant="body1" color="success.main" fontWeight={500}>
                {file.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                点击或拖拽更换文件
              </Typography>
            </>
          ) : (
            <>
              <Typography variant="body1" color={isDragging ? 'primary.main' : 'text.primary'}>
                {isDragging ? '松开以上传文件' : '拖拽文件、点击选择，或粘贴截图'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                支持的格式: .txt, .pdf, .docx, .jpg, .png, .webp
              </Typography>
              <Typography variant="caption" color="primary.main" sx={{ mt: 0.5, display: 'block' }}>
                💡 可直接粘贴剪贴板中的图片 (⌘+V / Ctrl+V)
              </Typography>
            </>
          )}
        </Box>
        )}

        {/* 文字输入模式 */}
        {inputMode === 'text' && (
          <Box sx={{ mt: 2 }}>
            <TextField
              fullWidth
              multiline
              rows={12}
              placeholder="在此粘贴或输入对话内容...&#10;&#10;支持直接粘贴微信、钉钉、Slack 等聊天记录"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={loading}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontFamily: 'monospace',
                },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {textInput.length} 字符
            </Typography>
          </Box>
        )}

        {loading && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress variant="determinate" value={progress} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
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
          disabled={
            loading ||
            (inputMode === 'file' && !file) ||
            (inputMode === 'text' && !textInput.trim())
          }
          startIcon={inputMode === 'file' ? <UploadFileIcon /> : <TextFieldsIcon />}
        >
          {loading ? '处理中...' : inputMode === 'file' ? '上传并提取' : '提交并提取'}
        </Button>
      </DialogActions>

      <ModelSelectionDialog
        open={showModelDialog}
        onClose={() => setShowModelDialog(false)}
        onConfirm={handleModelConfirm}
        title="选择提取模型"
        description="请选择用于提取对话内容的 GPT 模型"
      />
    </Dialog>
  );
}

export default function AssigneeDetailPage({ params }: AssigneeDetailPageProps) {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // 洞察编辑和删除状态
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    item: ConfirmedItem | null;
    content: string;
  }>({ open: false, item: null, content: '' });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    itemId: string | null;
  }>({ open: false, itemId: null });

  // 转为待办对话框状态
  const [todoDialog, setTodoDialog] = useState<{
    open: boolean;
    item: ConfirmedItem | null;
    title: string;
    dod: string;
    selectedAssigneeId: string;
    dueDate: string;
  }>({ open: false, item: null, title: '', dod: '', selectedAssigneeId: '', dueDate: '' });

  // 所有负责人列表（用于选择）
  const [allAssignees, setAllAssignees] = useState<{ id: string; name: string }[]>([]);

  // 周会议题对话框状态
  const [weeklyTopicsDialog, setWeeklyTopicsDialog] = useState<{
    open: boolean;
    loading: boolean;
    content: string;
  }>({ open: false, loading: false, content: '' });

  // 周会议题模型选择对话框
  const [showWeeklyTopicsModelDialog, setShowWeeklyTopicsModelDialog] = useState(false);

  // 发送飞书状态
  const [sendingToFeishu, setSendingToFeishu] = useState(false);

  // 综合画像
  const [profile, setProfile] = useState<AssigneeProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // OKR 目标
  const [okrData, setOkrData] = useState<any[]>([]);

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
      loadProfile();
      // Load OKR data
      fetch(`/api/okr?ownerId=${assigneeId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setOkrData(data.data);
        })
        .catch(() => {});
    }
  }, [assigneeId]);

  const loadProfile = async () => {
    if (!assigneeId) return;
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/assignees/${assigneeId}/profile`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
      }
    } catch {
      // Profile is optional — silently ignore errors
    } finally {
      setProfileLoading(false);
    }
  };

  const getSentimentLabel = (trend: { date: string; sentiment: number }[]): string => {
    if (!trend || trend.length < 2) return '数据不足';
    const first = trend[0].sentiment;
    const last = trend[trend.length - 1].sentiment;
    const diff = last - first;
    if (diff > 0.1) return '上升';
    if (diff < -0.1) return '下降';
    return '稳定';
  };

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

  const loadAllAssignees = async () => {
    try {
      const res = await fetch('/api/assignees', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.success) {
        setAllAssignees(data.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
      }
    } catch (error) {
      console.error('加载负责人列表失败:', error);
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

  // 洞察编辑处理
  const handleEditClick = (item: ConfirmedItem) => {
    setEditDialog({ open: true, item, content: item.content });
  };

  const handleEditSave = async () => {
    if (!editDialog.item) return;

    try {
      const res = await fetch(`/api/insights/confirmed/${editDialog.item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: editDialog.content }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 更新本地状态
        if (assignee) {
          setAssignee({
            ...assignee,
            confirmedItems: assignee.confirmedItems.map((item) =>
              item.id === editDialog.item!.id
                ? { ...item, content: editDialog.content }
                : item
            ),
          });
        }
        setSnackbar({ open: true, message: '更新成功', severity: 'success' });
        setEditDialog({ open: false, item: null, content: '' });
      } else {
        setSnackbar({ open: true, message: data.error || '更新失败', severity: 'error' });
      }
    } catch (error) {
      console.error('更新失败:', error);
      setSnackbar({ open: true, message: '更新失败', severity: 'error' });
    }
  };

  // 洞察删除处理
  const handleDeleteClick = (itemId: string) => {
    setDeleteDialog({ open: true, itemId });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.itemId) return;

    try {
      const res = await fetch(`/api/insights/confirmed/${deleteDialog.itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 更新本地状态
        if (assignee) {
          setAssignee({
            ...assignee,
            confirmedItems: assignee.confirmedItems.filter(
              (item) => item.id !== deleteDialog.itemId
            ),
            _count: {
              ...assignee._count,
              confirmedItems: assignee._count.confirmedItems - 1,
            },
          });
        }
        setSnackbar({ open: true, message: '删除成功', severity: 'success' });
        setDeleteDialog({ open: false, itemId: null });
      } else {
        setSnackbar({ open: true, message: data.error || '删除失败', severity: 'error' });
      }
    } catch (error) {
      console.error('删除失败:', error);
      setSnackbar({ open: true, message: '删除失败', severity: 'error' });
    }
  };

  // 打开转为待办对话框
  const handleConvertToTodo = async (item: ConfirmedItem) => {
    // 加载所有负责人列表
    await loadAllAssignees();
    setTodoDialog({
      open: true,
      item,
      title: item.content,
      dod: '',
      selectedAssigneeId: assigneeId, // 默认当前负责人
      dueDate: '',
    });
  };

  // 确认转为待办
  const handleConfirmConvertToTodo = async () => {
    if (!todoDialog.item || !todoDialog.title.trim()) return;

    try {
      // 1. 创建任务
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: todoDialog.title.trim(),
          dod: todoDialog.dod.trim() || null,
          assigneeId: todoDialog.selectedAssigneeId || null,
          dueDate: todoDialog.dueDate || null,
          status: 'TODO',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSnackbar({ open: true, message: data.error || '添加失败', severity: 'error' });
        return;
      }

      // 2. 删除行动项
      const deleteRes = await fetch(`/api/insights/confirmed/${todoDialog.item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      // 3. 更新本地状态
      if (assignee) {
        const isCurrentAssignee = todoDialog.selectedAssigneeId === assigneeId;
        setAssignee({
          ...assignee,
          // 只有当选择的负责人是当前负责人时才添加到任务列表
          tasks: isCurrentAssignee ? [data.data, ...assignee.tasks] : assignee.tasks,
          confirmedItems: assignee.confirmedItems.filter(
            (item) => item.id !== todoDialog.item!.id
          ),
          _count: {
            ...assignee._count,
            tasks: isCurrentAssignee ? assignee._count.tasks + 1 : assignee._count.tasks,
            confirmedItems: assignee._count.confirmedItems - 1,
          },
        });
      }

      setSnackbar({ open: true, message: '已添加到待办列表', severity: 'success' });
      setTodoDialog({ open: false, item: null, title: '', dod: '', selectedAssigneeId: '', dueDate: '' });
    } catch (error) {
      console.error('添加待办失败:', error);
      setSnackbar({ open: true, message: '添加失败', severity: 'error' });
    }
  };

  // 生成周会议题 - 显示模型选择对话框
  const handleGenerateWeeklyTopics = () => {
    setShowWeeklyTopicsModelDialog(true);
  };

  // 确认模型后生成周会议题
  const handleWeeklyTopicsModelConfirm = async (model: string) => {
    setWeeklyTopicsDialog({ open: true, loading: true, content: '' });

    try {
      const res = await fetch('/api/insights/weekly-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assigneeId, model }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setWeeklyTopicsDialog({ open: true, loading: false, content: data.data.content });
      } else {
        setSnackbar({ open: true, message: data.error || '生成失败', severity: 'error' });
        setWeeklyTopicsDialog({ open: false, loading: false, content: '' });
      }
    } catch (error) {
      console.error('生成周会议题失败:', error);
      setSnackbar({ open: true, message: '生成失败', severity: 'error' });
      setWeeklyTopicsDialog({ open: false, loading: false, content: '' });
    }
  };

  // 发送周会议题到飞书
  const handleSendToFeishu = async () => {
    if (!weeklyTopicsDialog.content || !assignee) return;

    setSendingToFeishu(true);
    try {
      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const message = `📋 **周会议题 - ${assignee.name}**\n\n${weeklyTopicsDialog.content}\n\n────────────────────\n生成时间：${timestamp}\n💡 通过 POA Master 生成`;

      const res = await fetch('/api/insights/send-to-feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSnackbar({ open: true, message: '已发送到飞书', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.error || '发送失败', severity: 'error' });
      }
    } catch (error) {
      console.error('发送到飞书失败:', error);
      setSnackbar({ open: true, message: '发送失败，请稍后重试', severity: 'error' });
    } finally {
      setSendingToFeishu(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Typography>加载中...</Typography>
      </Box>
    );
  }

  if (!assignee) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Alert severity="error">负责人不存在</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <IconButton onClick={() => router.back()} sx={{ mr: 1 }} aria-label="返回">
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h4" gutterBottom sx={{ mb: 0.5 }}>
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
              <Typography variant="body2" color="text.secondary">
                洞察数: <strong>{assignee._count.confirmedItems}</strong>
              </Typography>
            </Box>
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={() => setUploadDialogOpen(true)}
          size="large"
          sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
        >
          上传对话
        </Button>
      </Box>

      {/* Profile Section */}
      <Paper sx={{ mt: 3 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">综合画像</Typography>
        </Box>
        <Box sx={{ p: 2 }}>
          {profileLoading ? (
            <Box sx={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4].map((i) => (
                <Box key={i} sx={{ flex: 1, p: 2 }}>
                  <Skeleton variant="text" width="60%" height={40} />
                  <Skeleton variant="text" width="80%" />
                </Box>
              ))}
            </Box>
          ) : profile ? (
            <>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Box
                  sx={{
                    flex: '1 1 140px',
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    textAlign: 'center',
                    minWidth: 140,
                  }}
                >
                  <Typography variant="h4" fontWeight={700} color="primary.main">
                    {profile.messageCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    本周消息 (条)
                  </Typography>
                </Box>
                <Box
                  sx={{
                    flex: '1 1 140px',
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    textAlign: 'center',
                    minWidth: 140,
                  }}
                >
                  <Typography variant="h4" fontWeight={700} color="info.main">
                    {profile.activeChatCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    活跃群数 (个)
                  </Typography>
                </Box>
                <Box
                  sx={{
                    flex: '1 1 140px',
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    textAlign: 'center',
                    minWidth: 140,
                  }}
                >
                  <Typography variant="h4" fontWeight={700} color="success.main">
                    {profile.completionRate}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    任务完成率
                  </Typography>
                </Box>
                <Box
                  sx={{
                    flex: '1 1 140px',
                    p: 2,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    textAlign: 'center',
                    minWidth: 140,
                  }}
                >
                  <Typography variant="h4" fontWeight={700} color="warning.main">
                    {profile.unresolvedSignals}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    活跃信号 (个)
                  </Typography>
                </Box>
              </Box>
              {profile.sentimentTrend && profile.sentimentTrend.length > 0 && (
                <Box sx={{ mt: 2, px: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    情绪趋势：{getSentimentLabel(profile.sentimentTrend)}
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                暂无画像数据
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Tasks Table */}
      <Paper sx={{ mt: 3 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6">任务列表</Typography>
          {assignee.tasks.length > 0 && (
            <Button
              size="small"
              variant="text"
              startIcon={showCompleted ? <HideIcon fontSize="small" /> : <ShowIcon fontSize="small" />}
              onClick={() => setShowCompleted(!showCompleted)}
              sx={{ fontSize: '0.8rem', color: dt.text.muted }}
            >
              {showCompleted ? '隐藏已完成' : '显示已完成'}
              {!showCompleted && ` (${assignee.tasks.filter(t => t.status === 'DONE' || t.status === 'CANCELLED').length})`}
            </Button>
          )}
        </Box>
        {(() => {
          const filteredTasks = assignee.tasks
            .filter(t => showCompleted || (t.status !== 'DONE' && t.status !== 'CANCELLED'))
            .sort((a, b) => {
              // Tasks with due dates first, sorted nearest first; no due date at end
              if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
              if (a.dueDate && !b.dueDate) return -1;
              if (!a.dueDate && b.dueDate) return 1;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

          if (filteredTasks.length === 0) {
            return (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {assignee.tasks.length === 0 ? '暂无任务' : '没有进行中的任务'}
                </Typography>
              </Box>
            );
          }

          if (isMobile) {
            return (
              <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {filteredTasks.map((task) => {
                  const isOverdue = task.dueDate && task.status !== 'DONE' && task.status !== 'CANCELLED' && new Date(task.dueDate) < new Date(new Date().toDateString());
                  return (
                    <Card
                      key={task.id}
                      sx={{
                        bgcolor: isOverdue ? alpha(dt.danger.main, 0.06) : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => router.push(`/todo/${task.id}`)}
                    >
                      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: dt.text.primary, mb: 0.5 }}>
                          {task.title}
                        </Typography>
                        {task.dod && (
                          <Typography variant="caption" sx={{ color: dt.text.muted, fontStyle: 'italic', display: 'block', mb: 1 }}>
                            {task.dod}
                          </Typography>
                        )}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <TaskStatusChip status={task.status} />
                          {task.dueDate && (
                            <Typography variant="caption" sx={{ color: isOverdue ? dt.danger.main : dt.text.muted, fontWeight: isOverdue ? 600 : 400, fontFeatureSettings: '"tnum"' }}>
                              {formatDate(task.dueDate)}
                            </Typography>
                          )}
                          {isOverdue && (
                            <Chip label="逾期" color="error" size="small" sx={{ fontWeight: 700, height: 22 }} />
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            );
          }

          return (
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
                  {filteredTasks.map((task) => {
                    const isOverdue = task.dueDate && task.status !== 'DONE' && task.status !== 'CANCELLED' && new Date(task.dueDate) < new Date(new Date().toDateString());
                    return (
                      <TableRow key={task.id} sx={{ bgcolor: isOverdue ? alpha(dt.danger.main, 0.06) : 'transparent' }}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{task.title}</Typography>
                          {task.dod && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                              {task.dod}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <TaskStatusChip status={task.status} />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontFeatureSettings: '"tnum"', color: isOverdue ? dt.danger.main : dt.text.secondary, fontWeight: isOverdue ? 600 : 400 }}>
                              {task.dueDate ? formatDate(task.dueDate) : '-'}
                            </Typography>
                            {isOverdue && (
                              <Chip label="逾期" color="error" size="small" sx={{ fontWeight: 700, height: 22 }} />
                            )}
                          </Box>
                        </TableCell>
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
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          );
        })()}
      </Paper>

      {/* OKR 目标 */}
      <Paper sx={{ p: 3, mb: 3, mt: 3, bgcolor: dt.bg.elevated, border: `1px solid ${dt.border.default}`, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            OKR 目标
          </Typography>
          <Button
            size="small"
            onClick={() => router.push('/okr')}
            sx={{ textTransform: 'none' }}
          >
            查看全部
          </Button>
        </Box>
        {okrData.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            暂无 OKR 目标
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {okrData.map((obj: any) => (
              <Card
                key={obj.id}
                sx={{
                  bgcolor: dt.bg.elevated,
                  border: `1px solid ${dt.border.default}`,
                  borderRadius: 2,
                  cursor: 'pointer',
                  '&:hover': { borderColor: dt.border.hover },
                }}
                elevation={0}
                onClick={() => router.push(`/okr/${obj.id}`)}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {obj.title}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip label={obj.periodLabel} size="small" variant="outlined" />
                      <Chip
                        label={obj.status}
                        size="small"
                        color={obj.status === 'ACTIVE' ? 'primary' : obj.status === 'COMPLETED' ? 'success' : 'default'}
                      />
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={obj.progress || 0}
                      sx={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        bgcolor: dt.bg.deep,
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 3,
                          bgcolor: (obj.progress || 0) >= 70 ? '#00B894' : (obj.progress || 0) >= 30 ? '#FDCB6E' : '#E17055',
                        },
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 35 }}>
                      {obj.progress || 0}%
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {obj.keyResults?.length || 0} 个关键结果
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Paper>

      {/* Confirmed Items (Insights) - Grouped by Dimension */}
      <Paper sx={{ mt: 3 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">对话洞察</Typography>
          {assignee.confirmedItems.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<InsightIcon />}
              onClick={handleGenerateWeeklyTopics}
              disabled={weeklyTopicsDialog.loading}
            >
              {weeklyTopicsDialog.loading ? '生成中...' : '生成周会议题'}
            </Button>
          )}
        </Box>
        {assignee.confirmedItems.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              暂无洞察，点击"上传对话"按钮添加
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            {DIMENSION_ORDER.map((dimension) => {
              const dimensionItems = assignee.confirmedItems.filter(
                (item) => item.dimension === dimension
              );
              if (dimensionItems.length === 0) return null;

              return (
                <Box key={dimension} sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                    <Chip
                      label={DIMENSION_LABELS[dimension] || dimension}
                      color={DIMENSION_COLORS[dimension] || 'default'}
                      size="small"
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {dimensionItems.length} 条
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {dimensionItems.map((item) => (
                      <Paper
                        key={item.id}
                        variant="outlined"
                        sx={{ p: 2, bgcolor: 'transparent' }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2">{item.content}</Typography>
                            {item.sourceText && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                来源: {item.sourceText.length > 100 ? item.sourceText.substring(0, 100) + '...' : item.sourceText}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                              {formatDate(item.createdAt)}
                            </Typography>
                          </Box>
                          <Box sx={{ ml: 1, display: 'flex', flexShrink: 0 }}>
                            {dimension === 'action' && (
                              <IconButton
                                size="small"
                                onClick={() => handleConvertToTodo(item)}
                                color="success"
                                title="转为待办"
                              >
                                <AddToTodoIcon fontSize="small" />
                              </IconButton>
                            )}
                            <IconButton
                              size="small"
                              onClick={() => handleEditClick(item)}
                              color="primary"
                              title="编辑"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteClick(item.id)}
                              color="error"
                              title="删除"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>

      {/* Upload Dialog */}
      <UploadDialog
        assigneeId={assignee.id}
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
      />

      {/* Edit Insight Dialog */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog({ open: false, item: null, content: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>编辑洞察</DialogTitle>
        <DialogContent>
          {editDialog.item && (
            <Box sx={{ mt: 1 }}>
              <Chip
                label={DIMENSION_LABELS[editDialog.item.dimension] || editDialog.item.dimension}
                color={DIMENSION_COLORS[editDialog.item.dimension] || 'default'}
                size="small"
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                multiline
                minRows={3}
                value={editDialog.content}
                onChange={(e) => setEditDialog({ ...editDialog, content: e.target.value })}
                placeholder="输入洞察内容"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, item: null, content: '' })}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSave}
            disabled={!editDialog.content.trim()}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Insight Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, itemId: null })}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除这条洞察吗？此操作无法撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, itemId: null })}>
            取消
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* Convert to Todo Dialog */}
      <Dialog
        open={todoDialog.open}
        onClose={() => setTodoDialog({ open: false, item: null, title: '', dod: '', selectedAssigneeId: '', dueDate: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>转为待办</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="任务标题"
              fullWidth
              value={todoDialog.title}
              onChange={(e) => setTodoDialog({ ...todoDialog, title: e.target.value })}
              placeholder="输入任务标题"
              required
            />
            <TextField
              label="完成标准 (DOD)"
              fullWidth
              multiline
              minRows={2}
              value={todoDialog.dod}
              onChange={(e) => setTodoDialog({ ...todoDialog, dod: e.target.value })}
              placeholder="可选：描述任务完成的标准"
            />
            <FormControl fullWidth>
              <InputLabel>负责人</InputLabel>
              <Select
                value={todoDialog.selectedAssigneeId}
                label="负责人"
                onChange={(e) => setTodoDialog({ ...todoDialog, selectedAssigneeId: e.target.value })}
              >
                {allAssignees.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                    {a.id === assigneeId && ' (当前)'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="截止时间"
              type="datetime-local"
              fullWidth
              value={todoDialog.dueDate}
              onChange={(e) => setTodoDialog({ ...todoDialog, dueDate: e.target.value })}
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />
            {todoDialog.item?.sourceText && (
              <Box sx={{ p: 1.5, bgcolor: 'transparent', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  来源: {todoDialog.item.sourceText.length > 150
                    ? todoDialog.item.sourceText.substring(0, 150) + '...'
                    : todoDialog.item.sourceText}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTodoDialog({ open: false, item: null, title: '', dod: '', selectedAssigneeId: '', dueDate: '' })}>
            取消
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmConvertToTodo}
            disabled={!todoDialog.title.trim()}
          >
            确认添加
          </Button>
        </DialogActions>
      </Dialog>

      {/* Weekly Topics Dialog */}
      <Dialog
        open={weeklyTopicsDialog.open}
        onClose={() => setWeeklyTopicsDialog({ open: false, loading: false, content: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InsightIcon color="primary" />
            周会议题 - {assignee?.name}
          </Box>
        </DialogTitle>
        <DialogContent>
          {weeklyTopicsDialog.loading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <LinearProgress sx={{ mb: 2 }} />
              <Typography color="text.secondary">
                正在分析洞察和任务，生成周会议题...
              </Typography>
            </Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: 'transparent',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  lineHeight: 1.8,
                }}
              >
                {weeklyTopicsDialog.content}
              </Paper>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleSendToFeishu}
            variant="contained"
            color="primary"
            disabled={weeklyTopicsDialog.loading || !weeklyTopicsDialog.content || sendingToFeishu}
          >
            {sendingToFeishu ? '发送中...' : '发送到飞书'}
          </Button>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(weeklyTopicsDialog.content);
              setSnackbar({ open: true, message: '已复制到剪贴板', severity: 'success' });
            }}
            disabled={weeklyTopicsDialog.loading || !weeklyTopicsDialog.content}
          >
            复制内容
          </Button>
          <Button
            onClick={() => setWeeklyTopicsDialog({ open: false, loading: false, content: '' })}
          >
            关闭
          </Button>
        </DialogActions>
      </Dialog>

      {/* 周会议题模型选择对话框 */}
      <ModelSelectionDialog
        open={showWeeklyTopicsModelDialog}
        onClose={() => setShowWeeklyTopicsModelDialog(false)}
        onConfirm={handleWeeklyTopicsModelConfirm}
        title="选择生成模型"
        description="请选择用于生成周会议题的 GPT 模型"
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
    </Box>
  );
}
