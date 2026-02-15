'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Button,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Message as MessageIcon,
  Today as TodayIcon,
  Circle as CircleIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  MonitorHeart as PulseIcon,
} from '@mui/icons-material';

/** Shorten a numeric ID to last 6 chars */
function shortenId(id: string): string {
  if (!id) return '?';
  if (id.length > 8 && /^\d+$/.test(id)) return `...${id.slice(-6)}`;
  return id;
}

interface Stats {
  totalChats: number;
  totalMessages: number;
  todayMessages: number;
  recentChats: Array<{
    id: string;
    chatId: string;
    chatType: string;
    name: string | null;
    lastMessage: string | null;
    _count: { messages: number };
  }>;
}

interface ListenerStatus {
  status: 'running' | 'stopped';
  connectedAt?: string;
  messageCount?: number;
}

export default function FeishuPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([loadStats(), loadListenerStatus()]).finally(() => setLoading(false));

    // Auto-refresh every 30s to pick up new messages
    const interval = setInterval(() => {
      loadStats();
      loadListenerStatus();
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/feishu/stats', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch {
      setError('加载统计数据失败');
    }
  };

  const loadListenerStatus = async () => {
    try {
      const res = await fetch('/api/feishu/listener/status', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setListenerStatus(data);
      }
    } catch {
      // Non-critical, just show stopped
      setListenerStatus({ status: 'stopped' });
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Typography variant="h4">
          飞书集成
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            icon={<CircleIcon sx={{ fontSize: 12 }} />}
            label={listenerStatus?.status === 'running' ? '监听中' : '未启动'}
            color={listenerStatus?.status === 'running' ? 'success' : 'default'}
            variant="outlined"
            size="small"
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<SettingsIcon />}
            onClick={() => router.push('/feishu/settings')}
          >
            监听设置
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ChatIcon color="primary" />
                <Typography color="text.secondary" variant="body2">
                  总对话数
                </Typography>
              </Box>
              <Typography variant="h4">{stats?.totalChats || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <MessageIcon color="primary" />
                <Typography color="text.secondary" variant="body2">
                  总消息数
                </Typography>
              </Box>
              <Typography variant="h4">{stats?.totalMessages || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TodayIcon color="primary" />
                <Typography color="text.secondary" variant="body2">
                  今日新消息
                </Typography>
              </Box>
              <Typography variant="h4">{stats?.todayMessages || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CircleIcon
                  sx={{ fontSize: 16 }}
                  color={listenerStatus?.status === 'running' ? 'success' : 'error'}
                />
                <Typography color="text.secondary" variant="body2">
                  监听状态
                </Typography>
              </Box>
              <Typography variant="h5">
                {listenerStatus?.status === 'running' ? '运行中' : '已停止'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Team Pulse Entry */}
      <Card sx={{ mb: 4 }}>
        <CardActionArea onClick={() => router.push('/feishu/pulse')}>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <PulseIcon color="primary" sx={{ fontSize: 40 }} />
            <Box>
              <Typography variant="h6">团队脉搏</Typography>
              <Typography variant="body2" color="text.secondary">
                从群聊中提取运营信号，查看团队动态和每日摘要
              </Typography>
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>

      {/* Recent Chats */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">最近活跃对话</Typography>
        <Button
          variant="text"
          onClick={() => router.push('/feishu/chats')}
        >
          查看全部
        </Button>
      </Box>

      <Card>
        {stats?.recentChats && stats.recentChats.length > 0 ? (
          <List disablePadding>
            {stats.recentChats.map((chat, index) => (
              <ListItem
                key={chat.id}
                divider={index < stats.recentChats.length - 1}
                secondaryAction={
                  <Chip
                    label={`${chat._count.messages} 条`}
                    size="small"
                    variant="outlined"
                  />
                }
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => router.push(`/feishu/chats/${chat.chatId}`)}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: chat.chatType === 'group' ? 'primary.main' : 'secondary.main' }}>
                    {chat.chatType === 'group' ? <GroupIcon /> : <PersonIcon />}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    chat.name && chat.name !== chat.chatId
                      ? chat.name
                      : shortenId(chat.chatId)
                  }
                  primaryTypographyProps={{
                    sx: !chat.name || chat.name === chat.chatId
                      ? { fontFamily: 'monospace', color: 'text.secondary' }
                      : {},
                  }}
                  secondary={
                    <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip
                        label={chat.chatType === 'group' ? '群聊' : '私聊'}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      {chat.lastMessage && (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(chat.lastMessage).toLocaleString('zh-CN')}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <CardContent>
            <Typography color="text.secondary" align="center">
              暂无对话数据。请先配置飞书 Cookie 并启动监听服务。
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="contained"
                onClick={() => router.push('/feishu/settings')}
              >
                前往配置
              </Button>
            </Box>
          </CardContent>
        )}
      </Card>
    </Box>
  );
}
