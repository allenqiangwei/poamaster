'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Divider,
  Alert,
  IconButton,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Chip
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Refresh as RefreshIcon } from '@mui/icons-material';

interface OpenAIModel {
  id: string;
  created: number;
  ownedBy: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [configs, setConfigs] = useState({
    'openai.apiKey': '',
    'openai.allowedModels': 'gpt-4o,gpt-4o-mini',
    'feishu.appId': '',
    'feishu.appSecret': '',
    'feishu.chatId': '',
    'feishu.enabled': 'true',
    'feishu.cookie': ''
  });
  const [availableModels, setAvailableModels] = useState<OpenAIModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsFallback, setModelsFallback] = useState(false);

  useEffect(() => {
    loadConfigs();
    loadAvailableModels();
  }, []);

  const loadConfigs = async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' });
      const data = await res.json();
      setConfigs({ ...configs, ...data });
    } catch {
      setError('加载配置失败');
    }
  };

  const loadAvailableModels = async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/openai/models', { credentials: 'include' });
      const data = await res.json();
      setAvailableModels(data.models || []);
      setModelsFallback(data.fallback || false);
    } catch (err) {
      console.error('Failed to load models:', err);
      // 使用备用模型列表
      setAvailableModels([
        { id: 'gpt-4o', created: 0, ownedBy: 'openai' },
        { id: 'gpt-4o-mini', created: 0, ownedBy: 'openai' },
        { id: 'gpt-4-turbo', created: 0, ownedBy: 'openai' },
        { id: 'gpt-4', created: 0, ownedBy: 'openai' },
        { id: 'gpt-3.5-turbo', created: 0, ownedBy: 'openai' },
      ]);
      setModelsFallback(true);
    } finally {
      setLoadingModels(false);
    }
  };

  const isModelAllowed = (modelId: string) => {
    const allowedModels = configs['openai.allowedModels']?.split(',') || [];
    return allowedModels.includes(modelId);
  };

  const toggleModel = (modelId: string) => {
    const allowedModels = configs['openai.allowedModels']?.split(',').filter(Boolean) || [];
    const newAllowed = isModelAllowed(modelId)
      ? allowedModels.filter(id => id !== modelId)
      : [...allowedModels, modelId];
    setConfigs({ ...configs, 'openai.allowedModels': newAllowed.join(',') });
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        credentials: "include",
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
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => router.back()}
          sx={{ mr: 2 }}
          aria-label="返回"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">
          ⚙️ 系统配置
        </Typography>
      </Box>

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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            OpenAI 配置
          </Typography>
          <Button
            size="small"
            startIcon={loadingModels ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={loadAvailableModels}
            disabled={loadingModels}
          >
            刷新模型列表
          </Button>
        </Box>

        <TextField
          label="API 密钥"
          fullWidth
          margin="normal"
          type="password"
          value={configs['openai.apiKey']}
          onChange={(e) =>
            setConfigs({ ...configs, 'openai.apiKey': e.target.value })
          }
          helperText="用于 AI 任务提取功能"
        />

        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle1">
              允许使用的模型
            </Typography>
            {modelsFallback && (
              <Chip
                label="使用备用列表"
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            勾选您允许在 AI 提取时使用的模型。执行提取时会弹窗让您选择具体使用哪个模型。
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="caption">
              💡 提示：只显示支持聊天功能的模型（gpt-4o、gpt-4-turbo、gpt-3.5-turbo 等）。
              如果看到不熟悉的模型，建议只选择常用的 GPT 模型。
            </Typography>
          </Alert>

          {loadingModels ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {availableModels.length === 0 ? (
                <Alert severity="warning">
                  无法加载模型列表。请检查 API 密钥配置或网络连接。
                </Alert>
              ) : (
                availableModels.map((model) => (
                  <FormControlLabel
                    key={model.id}
                    control={
                      <Checkbox
                        checked={isModelAllowed(model.id)}
                        onChange={() => toggleModel(model.id)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body1">{model.id}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {model.ownedBy}
                        </Typography>
                      </Box>
                    }
                  />
                ))
              )}
            </Box>
          )}
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          飞书配置
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="应用 ID"
            fullWidth
            value={configs['feishu.appId']}
            onChange={(e) =>
              setConfigs({ ...configs, 'feishu.appId': e.target.value })
            }
          />
          <TextField
            label="应用密钥"
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

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          飞书消息监听
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="caption">
            配置飞书 Cookie 后可启用实时消息监听，采集群聊和私聊消息。
            获取方式：登录飞书网页版 → F12 → Network 标签 → 刷新页面 → 点击任意请求 → 复制 Request Headers 中的 Cookie 值。
            （注意：不能用 document.cookie，因为关键字段 passport_web_did 是 httpOnly 的）
          </Typography>
        </Alert>
        <TextField
          label="飞书 Cookie"
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          type="password"
          value={configs['feishu.cookie']}
          onChange={(e) =>
            setConfigs({ ...configs, 'feishu.cookie': e.target.value })
          }
          helperText="从飞书网页版获取的 Cookie（加密存储）"
        />
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
