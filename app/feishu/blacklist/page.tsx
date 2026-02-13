'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Card,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  IconButton,
  Button,
} from '@mui/material';
import {
  Group as GroupIcon,
  Person as PersonIcon,
  ArrowBack as ArrowBackIcon,
  RestoreOutlined as RestoreIcon,
} from '@mui/icons-material';

interface Chat {
  id: string;
  chatId: string;
  chatType: string;
  name: string | null;
  memberCount: number | null;
  blacklistedAt: string | null;
  _count: { messages: number };
}

export default function FeishuBlacklistPage() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBlacklist = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/feishu/chats?blacklisted=true&limit=100', {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setChats(data.chats);
      } else {
        setError(data.error || '加载失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlacklist();
  }, [loadBlacklist]);

  const handleRemove = async (chat: Chat) => {
    try {
      const res = await fetch('/api/feishu/chats', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: chat.chatId, isBlacklisted: false }),
      });
      const data = await res.json();
      if (data.success) {
        setChats(prev => prev.filter(c => c.chatId !== chat.chatId));
      }
    } catch {
      // ignore
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push('/feishu/chats')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">黑名单管理</Typography>
        <Chip label={`共 ${chats.length} 个`} variant="outlined" size="small" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : chats.length === 0 ? (
        <Alert severity="info">暂无黑名单对话</Alert>
      ) : (
        <Card>
          <List disablePadding>
            {chats.map((chat, index) => (
              <ListItem
                key={chat.id}
                divider={index < chats.length - 1}
                secondaryAction={
                  <Button
                    size="small"
                    startIcon={<RestoreIcon />}
                    onClick={() => handleRemove(chat)}
                  >
                    移除黑名单
                  </Button>
                }
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: chat.chatType === 'group' ? 'primary.main' : 'secondary.main' }}>
                    {chat.chatType === 'group' ? <GroupIcon /> : <PersonIcon />}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={chat.name || chat.chatId}
                  secondary={
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                      <Chip
                        label={chat.chatType === 'group' ? '群聊' : '私聊'}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      <Chip
                        label={`${chat._count.messages} 条消息`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      {chat.blacklistedAt && (
                        <Typography variant="caption" color="text.secondary">
                          拉黑于: {new Date(chat.blacklistedAt).toLocaleString('zh-CN')}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Card>
      )}
    </Box>
  );
}
