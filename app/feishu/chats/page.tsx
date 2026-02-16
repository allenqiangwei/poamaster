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
  Avatar,
  Chip,
  Pagination,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  alpha,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Search as SearchIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  BlockOutlined as BlockIcon,
  Chat as ChatIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import { useResponsive } from '@/hooks/useResponsive';

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
  const { isMobile } = useResponsive();
  const [chats, setChats] = useState<Chat[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Mobile context menu
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuChat, setMenuChat] = useState<Chat | null>(null);

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
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, mb: 3, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => router.push('/feishu')}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">对话列表</Typography>
          <Chip label={`共 ${total} 个`} variant="outlined" size="small" />
        </Box>
        <Box sx={{ ml: { xs: 0, sm: 'auto' } }}>
          <Button
            size="small"
            startIcon={<BlockIcon />}
            onClick={() => router.push('/feishu/alerts?tab=blacklist')}
          >
            黑名单管理
          </Button>
        </Box>
      </Box>

      {/* Search & Filter */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索对话名称或ID..."
          size="small"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 300 } }}
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 1 : 0 }}>
            {chats.map((chat, index) => {
              const displayName = chatDisplayName(chat);
              const isUnnamed = !chat.name || chat.name === chat.chatId;
              const isGroup = chat.chatType === 'group';
              const lastActive = chat.lastMessage
                ? new Date(chat.lastMessage).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : null;

              return (
                <Box
                  key={chat.id}
                  onClick={() => router.push(`/feishu/chats/${chat.chatId}`)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    borderRadius: isMobile ? 2 : 0,
                    bgcolor: isMobile ? dt.bg.elevated : 'transparent',
                    borderBottom: !isMobile && index < chats.length - 1 ? `1px solid ${dt.border.subtle}` : 'none',
                    '&:hover': { bgcolor: alpha(dt.accent.main, 0.04) },
                  }}
                >
                  {/* Avatar */}
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: isGroup ? alpha(dt.accent.main, 0.12) : alpha(dt.purple.main, 0.12),
                      color: isGroup ? dt.accent.main : dt.purple.main,
                      flexShrink: 0,
                    }}
                  >
                    {isGroup ? <GroupIcon sx={{ fontSize: 20 }} /> : <PersonIcon sx={{ fontSize: 20 }} />}
                  </Avatar>

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Row 1: name + time */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{
                          flex: 1,
                          fontWeight: isUnnamed ? 400 : 600,
                          color: isUnnamed ? dt.text.muted : dt.text.primary,
                          fontFamily: isUnnamed ? 'monospace' : 'inherit',
                          fontSize: '0.875rem',
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
                          sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
                        />
                      )}
                      {lastActive && (
                        <Typography
                          variant="caption"
                          sx={{ color: dt.text.muted, flexShrink: 0, fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                        >
                          {lastActive}
                        </Typography>
                      )}
                    </Box>
                    {/* Row 2: type + message count */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: isGroup ? dt.accent.main : dt.purple.main,
                          fontWeight: 500,
                          fontSize: '0.7rem',
                        }}
                      >
                        {isGroup ? '群聊' : '私聊'}
                        {isGroup && chat.memberCount ? ` · ${chat.memberCount}人` : ''}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ChatIcon sx={{ fontSize: 12, color: dt.text.muted }} />
                        <Typography variant="caption" sx={{ color: dt.text.muted, fontSize: '0.7rem' }}>
                          {chat._count.messages}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Actions */}
                  {isMobile ? (
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); setMenuChat(chat); }}
                      sx={{ flexShrink: 0, opacity: 0.4 }}
                    >
                      <MoreIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, opacity: 0.4, '&:hover': { opacity: 1 } }}>
                      <IconButton size="small" onClick={(e) => handleBlacklist(chat, e)} title="拉黑">
                        <BlockIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                      <IconButton size="small" onClick={(e) => openRenameDialog(chat, e)} title="重命名">
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, p) => setPage(p)}
                color="primary"
                size={isMobile ? 'small' : 'medium'}
              />
            </Box>
          )}
        </>
      )}

      {/* Mobile context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => { setMenuAnchor(null); setMenuChat(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={(e) => { if (menuChat) openRenameDialog(menuChat, e as unknown as React.MouseEvent); setMenuAnchor(null); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>重命名</ListItemText>
        </MenuItem>
        <MenuItem onClick={(e) => { if (menuChat) handleBlacklist(menuChat, e as unknown as React.MouseEvent); setMenuAnchor(null); setMenuChat(null); }}>
          <ListItemIcon><BlockIcon fontSize="small" /></ListItemIcon>
          <ListItemText>拉黑</ListItemText>
        </MenuItem>
      </Menu>

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
