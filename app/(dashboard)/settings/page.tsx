'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Divider,
  Alert
} from '@mui/material';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [configs, setConfigs] = useState({
    'openai.apiKey': '',
    'feishu.appId': '',
    'feishu.appSecret': '',
    'feishu.chatId': '',
    'feishu.enabled': 'true'
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfigs({ ...configs, ...data });
    } catch {
      setError('加载配置失败');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs)
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('保存失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        ⚙️ 系统配置
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          配置保存成功
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          OpenAI 配置
        </Typography>
        <TextField
          label="API Key"
          fullWidth
          margin="normal"
          type="password"
          value={configs['openai.apiKey']}
          onChange={(e) =>
            setConfigs({ ...configs, 'openai.apiKey': e.target.value })
          }
          helperText="用于 AI 任务提取功能"
        />
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          飞书配置
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="App ID"
            fullWidth
            value={configs['feishu.appId']}
            onChange={(e) =>
              setConfigs({ ...configs, 'feishu.appId': e.target.value })
            }
          />
          <TextField
            label="App Secret"
            fullWidth
            type="password"
            value={configs['feishu.appSecret']}
            onChange={(e) =>
              setConfigs({ ...configs, 'feishu.appSecret': e.target.value })
            }
          />
          <TextField
            label="通知群聊 Chat ID"
            fullWidth
            value={configs['feishu.chatId']}
            onChange={(e) =>
              setConfigs({ ...configs, 'feishu.chatId': e.target.value })
            }
            helperText="接收每日任务通知的群聊 ID"
          />
        </Box>
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? '保存中...' : '保存配置'}
        </Button>
      </Box>
    </Container>
  );
}
