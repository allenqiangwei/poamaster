'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Add as AddIcon, PlayArrow as QuickStartIcon, Delete as DeleteIcon } from '@mui/icons-material';

export default function RoundtablePage() {
  const router = useRouter();
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; discussionId: string | null; title: string }>({
    open: false,
    discussionId: null,
    title: '',
  });
  const [deleting, setDeleting] = useState(false);

  // 格式化处理进度
  const getProgressText = (discussion: any): string => {
    if (discussion.status === 'completed') return '已完成';
    if (discussion.status === 'failed') return '失败';

    // 处理中状态：显示当前轮次
    const roundsCount = discussion._count?.rounds || 0;
    const latestRound = discussion.rounds?.[0];

    if (roundsCount === 0) {
      return '准备中...';
    }

    const roundNames: Record<string, string> = {
      'clarify': '第1轮：澄清理解',
      'question': '第2轮：质疑挑战',
      'rebuttal': '第3轮：反驳辩护',
      'verdict': '第4轮：最终判决',
    };

    if (latestRound) {
      const name = roundNames[latestRound.roundType] || `第${roundsCount}轮`;
      return `${name}...`;
    }

    return `第${roundsCount}/4轮`;
  };

  useEffect(() => {
    fetchDiscussions();
  }, []);

  const fetchDiscussions = async () => {
    try {
      const res = await fetch('/api/roundtable/discussions?limit=10');
      if (!res.ok) throw new Error('Failed to fetch discussions');
      const data = await res.json();
      setDiscussions(data.discussions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, discussion: any) => {
    e.stopPropagation(); // 防止触发卡片的点击事件
    setDeleteDialog({
      open: true,
      discussionId: discussion.id,
      title: discussion.title,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.discussionId) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/roundtable/discussions/${deleteDialog.discussionId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('删除失败');
      }

      // 从列表中移除已删除的讨论
      setDiscussions(discussions.filter((d: any) => d.id !== deleteDialog.discussionId));
      setDeleteDialog({ open: false, discussionId: null, title: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">圆桌会议</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => router.push('/roundtable/new?mode=select')}
          >
            选择模板
          </Button>
          <Button
            variant="contained"
            startIcon={<QuickStartIcon />}
            onClick={() => router.push('/roundtable/new?mode=quick')}
          >
            快速开始
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : discussions.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              还没有讨论记录
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              点击"快速开始"或"选择模板"创建第一个讨论
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {discussions.map((discussion: any) => (
            <Card
              key={discussion.id}
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
              onClick={() => router.push(`/roundtable/discussions/${discussion.id}`)}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                  <Typography variant="h6">{discussion.title}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip
                      label={getProgressText(discussion)}
                      size="small"
                      color={discussion.status === 'completed' ? 'success' : discussion.status === 'processing' ? 'primary' : 'error'}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => handleDeleteClick(e, discussion)}
                      sx={{ color: 'error.main' }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  模板：{discussion.template.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    行动项：{discussion.actions?.length || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    高风险：{discussion.risks?.length || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    创建时间：{new Date(discussion.createdAt).toLocaleString('zh-CN')}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* 删除确认对话框 */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => !deleting && setDeleteDialog({ open: false, discussionId: null, title: '' })}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除讨论"{deleteDialog.title}"吗？此操作无法撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialog({ open: false, discussionId: null, title: '' })}
            disabled={deleting}
          >
            取消
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
