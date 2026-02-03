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
} from '@mui/material';
import { Add as AddIcon, PlayArrow as QuickStartIcon } from '@mui/icons-material';

export default function RoundtablePage() {
  const router = useRouter();
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                  <Chip
                    label={discussion.status === 'completed' ? '已完成' : discussion.status === 'processing' ? '处理中' : '失败'}
                    size="small"
                    color={discussion.status === 'completed' ? 'success' : discussion.status === 'processing' ? 'primary' : 'error'}
                  />
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
    </Box>
  );
}
