'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Circle as CircleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface ListenerStatus {
  status: 'running' | 'stopped';
  connectedAt?: string;
  messageCount?: number;
}

export default function FeishuSettingsPage() {
  const router = useRouter();
  const [cookie, setCookie] = useState('');
  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([loadCookie(), loadStatus()]).finally(() => setLoading(false));
  }, []);

  const loadCookie = async () => {
    try {
      const res = await fetch('/api/config', { credentials: 'include' });
      const data = await res.json();
      if (data['feishu.cookie']) {
        setCookie(data['feishu.cookie']);
      }
    } catch {
      // Non-critical
    }
  };

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/feishu/listener/status', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setListenerStatus(data);
      }
    } catch {
      setListenerStatus({ status: 'stopped' });
    }
  };

  const handleSaveCookie = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'feishu.cookie': cookie }),
      });
      if (res.ok) {
        setSuccess('Cookie 保存成功');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('保存失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleStartListener = async () => {
    setStarting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/feishu/listener/start', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('监听服务已启动');
        setTimeout(() => {
          setSuccess('');
          loadStatus();
        }, 2000);
      } else {
        setError(data.error || '启动失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push('/feishu')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">飞书监听设置</Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Listener Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">监听状态</Typography>
            <IconButton size="small" onClick={loadStatus}>
              <RefreshIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <CircleIcon
              sx={{ fontSize: 20 }}
              color={listenerStatus?.status === 'running' ? 'success' : 'error'}
            />
            <Typography variant="h6">
              {listenerStatus?.status === 'running' ? '运行中' : '已停止'}
            </Typography>
          </Box>

          {listenerStatus?.connectedAt && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              连接时间: {new Date(listenerStatus.connectedAt).toLocaleString('zh-CN')}
            </Typography>
          )}
          {listenerStatus?.messageCount != null && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              已采集消息: {listenerStatus.messageCount} 条
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="success"
              startIcon={starting ? <CircularProgress size={16} /> : <PlayIcon />}
              onClick={handleStartListener}
              disabled={starting}
            >
              {listenerStatus?.status === 'running' ? '重启监听' : '启动监听'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Cookie Config */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            飞书 Cookie 配置
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              获取完整 Cookie 的方法（<strong>不能用 document.cookie</strong>，因为关键字段是 httpOnly）：
              <br />
              <br /><strong>方法一（推荐）：从 Network 面板获取</strong>
              <br />1. 在浏览器打开 <strong>https://www.feishu.cn</strong> 并登录
              <br />2. 按 F12 打开开发者工具 → 切换到 <strong>Network（网络）</strong> 标签
              <br />3. 刷新页面，在请求列表中点击任意一个请求（如第一个 HTML 请求）
              <br />4. 在右侧 Headers → <strong>Request Headers</strong> 中找到 <code>Cookie</code> 字段
              <br />5. 右键复制完整 Cookie 值粘贴到下方
              <br />
              <br /><strong>方法二：从 Application 面板获取</strong>
              <br />1. F12 → <strong>Application（应用）</strong> → 左侧 Cookies → <code>https://www.feishu.cn</code>
              <br />2. 手动拼接所有 cookie：<code>name1=value1; name2=value2; ...</code>
              <br />
              <br />注意：Cookie 必须包含 <code>passport_web_did</code> 字段（httpOnly 字段，document.cookie 无法获取）。
            </Typography>
          </Alert>
          <TextField
            label="飞书 Cookie"
            fullWidth
            multiline
            minRows={4}
            maxRows={8}
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            helperText="Cookie 将加密存储，用于飞书 WebSocket 认证"
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleSaveCookie}
            disabled={saving || !cookie.trim()}
          >
            {saving ? '保存中...' : '保存 Cookie'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
