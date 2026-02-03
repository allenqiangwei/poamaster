'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import { ArrowBack as BackIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import DiscussionReport from '@/components/roundtable/DiscussionReport';

export default function DiscussionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const discussionId = params.id as string;

  const [discussion, setDiscussion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDiscussion();
    const interval = setInterval(() => {
      if (discussion?.status === 'processing') {
        fetchDiscussion();
      }
    }, 5000); // 每5秒刷新一次处理中的讨论

    return () => clearInterval(interval);
  }, [discussionId, discussion?.status]);

  const fetchDiscussion = async () => {
    try {
      const res = await fetch(`/api/roundtable/discussions/${discussionId}`);
      if (!res.ok) throw new Error('Failed to fetch discussion');
      const data = await res.json();
      setDiscussion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    alert('PDF导出功能将在后续版本实现');
  };

  const handleSendToFeishu = async () => {
    alert('发送到飞书功能将在后续版本实现');
  };

  const handleCreateTask = async (actionId: string) => {
    try {
      const res = await fetch(`/api/roundtable/actions/${actionId}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error('Failed to create task');

      const task = await res.json();
      await fetchDiscussion();
      alert(`任务创建成功！任务ID: ${task.id}`);
    } catch (err) {
      alert('创建任务失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error">{error}</Alert>
        <Button onClick={() => router.push('/roundtable')} sx={{ mt: 2 }}>
          返回列表
        </Button>
      </Box>
    );
  }

  if (!discussion) {
    return <Alert severity="error">讨论不存在</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<BackIcon />}
            onClick={() => router.push('/roundtable')}
          >
            返回
          </Button>
          <Typography variant="h5">{discussion.title}</Typography>
          <Chip
            label={discussion.status === 'completed' ? '已完成' : discussion.status === 'processing' ? '处理中' : '失败'}
            color={discussion.status === 'completed' ? 'success' : discussion.status === 'processing' ? 'primary' : 'error'}
          />
        </Box>
        {discussion.status === 'processing' && (
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchDiscussion}
          >
            刷新
          </Button>
        )}
      </Box>

      {discussion.status === 'processing' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          讨论正在进行中，预计需要3-5分钟。您可以离开页面，完成后会收到飞书通知。
        </Alert>
      )}

      {discussion.status === 'failed' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          讨论处理失败：{discussion.errorMessage}
        </Alert>
      )}

      {discussion.status === 'completed' && (
        <DiscussionReport
          discussion={discussion}
          onExportPDF={handleExportPDF}
          onSendToFeishu={handleSendToFeishu}
          onCreateTask={handleCreateTask}
        />
      )}
    </Box>
  );
}
