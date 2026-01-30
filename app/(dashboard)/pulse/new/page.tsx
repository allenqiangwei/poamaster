'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入项目名称');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/pulse/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();

      if (data.success) {
        router.push(`/pulse/${data.data.id}`);
      } else {
        setError(data.error || '创建失败');
      }
    } catch (err) {
      setError('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/pulse')}
        sx={{ mb: 2 }}
      >
        返回
      </Button>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          新建项目
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：产品A开发"
            sx={{ mb: 3 }}
            autoFocus
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !name.trim()}
            >
              {loading ? '创建中...' : '创建项目'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => router.push('/pulse')}
            >
              取消
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
