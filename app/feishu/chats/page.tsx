'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Card,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Pagination,
  InputAdornment,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import {
  Search as SearchIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  BlockOutlined as BlockIcon,
} from '@mui/icons-material';

interface Chat {
  id: string;
  chatId: string;
  chatType: string;
  name: string | null;
  memberCount: number | null;
  lastMessage: string | null;
  _count: { messages: number };
}

/** Show a friendly display name: use name if set, otherwise show shortened ID */
function chatDisplayName(chat: Chat): string {
  if (chat.name && chat.name !== chat.chatId) return chat.name;
  // Show last 6 chars of the numeric chatId for readability
  const id = chat.chatId;
  if (id.length > 8) return `...${id.slice(-6)}`;
  return id;
}

export default function FeishuChatsPage() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameChat, setRenameChat] = useState<Chat | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const loadChats = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search) params.set('search', search);
      if (typeFilter !== 'all') params.set('type', typeFilter);

      const res = await fetch(`/api/feishu/chats?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setChats(data.chats);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      } else if (!silent) {
        setError(data.error || '加载失败');
      }
    } catch {
      if (!silent) setError('网络错误');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, search, typeFilter]);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Auto-refresh every 30s to pick up new messages
  useEffect(() => {
    const interval = setInterval(() => loadChats(true), 30_000);
    return () => clearInterval(interval);
  }, [loadChats]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleBlacklist = async (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/feishu/chats', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: chat.chatId, isBlacklisted: true }),
      });
      const data = await res.json();
      if (data.success) {
        setChats(prev => prev.filter(c => c.chatId !== chat.chatId));
        setTotal(prev => prev - 1);
      }
    } catch {
      // ignore
    }
  };

  const openRenameDialog = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameChat(chat);
    setRenameName(chat.name || '');
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!renameChat || !renameName.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch('/api/feishu/chats', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: renameChat.chatId, name: renameName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local state immediately
        setChats(prev => prev.map(c =>
          c.chatId === renameChat.chatId ? { ...c, name: renameName.trim() } : c
        ));
        setRenameOpen(false);
      }
    } catch {
      // ignore
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push('/feishu')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">对话列表</Typography>
        <Chip label={`共 ${total} 个`} variant="outlined" size="small" />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<BlockIcon />}
          onClick={() => router.push('/feishu/blacklist')}
        >
          黑名单管理
        </Button>
      </Box>

      {/* Search & Filter */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索对话名称或ID..."
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ minWidth: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        <ToggleButtonGroup
          value={typeFilter}
          exclusive
          onChange={(_, val) => { if (val) { setTypeFilter(val); setPage(1); } }}
          size="small"
        >
          <ToggleButton value="all">全部</ToggleButton>
          <ToggleButton value="group">群聊</ToggleButton>
          <ToggleButton value="private">私聊</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : chats.length === 0 ? (
        <Alert severity="info">
          {search ? `未找到包含"${search}"的对话` : '暂无对话数据'}
        </Alert>
      ) : (
        <>
          <Card>
            <List disablePadding>
              {chats.map((chat, index) => {
                const displayName = chatDisplayName(chat);
                const isUnnamed = !chat.name || chat.name === chat.chatId;

                return (
                  <ListItem
                    key={chat.id}
                    divider={index < chats.length - 1}
                    secondaryAction={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Tooltip title="拉黑">
                          <IconButton size="small" onClick={(e) => handleBlacklist(chat, e)}>
                            <BlockIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="重命名">
                          <IconButton size="small" onClick={(e) => openRenameDialog(chat, e)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {chat.memberCount && (
                          <Chip
                            label={`${chat.memberCount} 人`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                        <Chip
                          label={`${chat._count.messages} 条消息`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </Box>
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
                      disableTypography
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: isUnnamed ? 'normal' : 'medium',
                              color: isUnnamed ? 'text.secondary' : 'text.primary',
                              fontFamily: isUnnamed ? 'monospace' : 'inherit',
                            }}
                          >
                            {displayName}
                          </Typography>
                          {isUnnamed && (
                            <Chip
                              label="未命名"
                              size="small"
                              color="warning"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                          <Chip
                            label={chat.chatType === 'group' ? '群聊' : '私聊'}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                          {chat.lastMessage && (
                            <Typography variant="caption" color="text.secondary">
                              最后活跃: {new Date(chat.lastMessage).toLocaleString('zh-CN')}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          </Card>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, p) => setPage(p)}
                color="primary"
              />
            </Box>
          )}
        </>
      )}

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>重命名对话</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Chat ID: {renameChat?.chatId}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="对话名称"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleRename}
            disabled={renaming || !renameName.trim()}
          >
            {renaming ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
