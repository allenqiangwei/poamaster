'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Paper,
  Button,
  Avatar,
  Tooltip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Group as GroupIcon,
  Person as PersonIcon,
  Edit as EditIcon,
} from '@mui/icons-material';

interface Message {
  id: string;
  messageId: string;
  senderId: string;
  senderName: string;
  content: string;
  msgType: string;
  timestamp: string;
}

interface Chat {
  id: string;
  chatId: string;
  chatType: string;
  name: string | null;
  memberCount: number | null;
}

interface AssigneeOption {
  id: string;
  name: string;
}

/** Shorten a numeric ID to last 6 chars for readability */
function shortenId(id: string): string {
  if (!id) return '?';
  if (id.length > 8 && /^\d+$/.test(id)) return `...${id.slice(-6)}`;
  return id;
}

/** Display name for a message sender */
function senderDisplayName(msg: Message): string {
  const name = msg.senderName;
  // If senderName is the same as senderId (not resolved), shorten it
  if (!name || name === msg.senderId) return shortenId(msg.senderId);
  return name;
}

/** Display name for a chat */
function chatDisplayName(chat: Chat | null, chatId: string): string {
  if (chat?.name && chat.name !== chat.chatId) return chat.name;
  return shortenId(chatId);
}

export default function FeishuChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = use(params);
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Chat rename dialog
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Sender rename dialog
  const [senderRenameOpen, setSenderRenameOpen] = useState(false);
  const [senderRenameId, setSenderRenameId] = useState('');
  const [senderRenameName, setSenderRenameName] = useState('');
  const [senderRenaming, setSenderRenaming] = useState(false);

  // Assignee options for dropdown
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);

  const loadMessages = useCallback(async (pageNum: number, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const res = await fetch(
        `/api/feishu/chats/${chatId}/messages?page=${pageNum}&limit=50`,
        { credentials: 'include' }
      );
      const data = await res.json();
      if (data.success) {
        setMessages(prev => append ? [...prev, ...data.messages] : data.messages);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPage(pageNum);
      } else {
        setError(data.error || '加载失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [chatId]);

  useEffect(() => {
    // Load chat info from the chats API
    fetch(`/api/feishu/chats?search=&limit=1000`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const found = data.chats.find((c: Chat) => c.chatId === chatId);
          if (found) setChat(found);
        }
      });
    // Load assignee options for sender rename dropdown
    fetch('/api/assignees', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setAssigneeOptions(data.data.map((a: any) => ({ id: a.id, name: a.name })));
        }
      });
    loadMessages(1);
  }, [chatId, loadMessages]);

  // Generate a consistent color for each sender
  const senderColor = (senderId: string) => {
    let hash = 0;
    for (let i = 0; i < senderId.length; i++) {
      hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 50%, 45%)`;
  };

  const handleRename = async () => {
    if (!renameName.trim()) return;
    setRenaming(true);
    try {
      const res = await fetch('/api/feishu/chats', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, name: renameName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setChat(prev => prev ? { ...prev, name: renameName.trim() } : prev);
        setRenameOpen(false);
      }
    } catch {
      // ignore
    } finally {
      setRenaming(false);
    }
  };

  const openRename = () => {
    setRenameName(chat?.name || '');
    setRenameOpen(true);
  };

  const openSenderRename = (senderId: string, currentName: string) => {
    setSenderRenameId(senderId);
    setSenderRenameName(currentName === shortenId(senderId) ? '' : currentName);
    setSenderRenameOpen(true);
  };

  const handleSenderRename = async () => {
    if (!senderRenameName.trim() || !senderRenameId) return;
    setSenderRenaming(true);
    try {
      const res = await fetch('/api/feishu/senders', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: senderRenameId, name: senderRenameName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        // Update all messages from this sender in local state
        const newName = senderRenameName.trim();
        setMessages(prev =>
          prev.map(m =>
            m.senderId === senderRenameId
              ? { ...m, senderName: newName }
              : m
          )
        );
        // Also update chat name if it's a private chat
        if (chat?.chatType === 'private') {
          setChat(prev => prev ? { ...prev, name: newName } : prev);
        }
        // Refresh assignee list (new assignee may have been created)
        if (!assigneeOptions.some(a => a.name === newName)) {
          setAssigneeOptions(prev => [...prev, { id: '', name: newName }]);
        }
        setSenderRenameOpen(false);
      }
    } catch {
      // ignore
    } finally {
      setSenderRenaming(false);
    }
  };

  const displayName = chatDisplayName(chat, chatId);
  const isUnnamed = !chat?.name || chat.name === chat.chatId;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push('/feishu/chats')}>
          <ArrowBackIcon />
        </IconButton>
        <Avatar sx={{ bgcolor: chat?.chatType === 'group' ? 'primary.main' : 'secondary.main' }}>
          {chat?.chatType === 'group' ? <GroupIcon /> : <PersonIcon />}
        </Avatar>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="h5"
              sx={{
                fontFamily: isUnnamed ? 'monospace' : 'inherit',
                color: isUnnamed ? 'text.secondary' : 'text.primary',
              }}
            >
              {displayName}
            </Typography>
            <Tooltip title="重命名">
              <IconButton size="small" onClick={openRename}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              label={chat?.chatType === 'group' ? '群聊' : '私聊'}
              size="small"
              variant="outlined"
            />
            {chat?.memberCount && (
              <Chip label={`${chat.memberCount} 人`} size="small" variant="outlined" />
            )}
            <Typography variant="caption" color="text.secondary">
              共 {total} 条消息
            </Typography>
          </Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : messages.length === 0 ? (
        <Alert severity="info">暂无消息</Alert>
      ) : (
        <Card>
          <CardContent sx={{ p: 2 }}>
            {/* Message Timeline */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {messages.map((msg, index) => {
                // Show date separator
                const showDate = index === 0 ||
                  new Date(msg.timestamp).toDateString() !== new Date(messages[index - 1].timestamp).toDateString();

                const name = senderDisplayName(msg);
                const isIdOnly = name === shortenId(msg.senderId) && msg.senderId.length > 8;

                return (
                  <Box key={msg.id}>
                    {showDate && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                        <Chip
                          label={new Date(msg.timestamp).toLocaleDateString('zh-CN', {
                            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
                          })}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    )}
                    <Paper
                      variant="outlined"
                      sx={{ p: 1.5, bgcolor: 'grey.50' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Avatar
                          sx={{
                            width: 24,
                            height: 24,
                            fontSize: '0.75rem',
                            bgcolor: senderColor(msg.senderId),
                          }}
                        >
                          {name.replace('...', '').charAt(0)}
                        </Avatar>
                        <Tooltip title={isIdOnly ? `完整ID: ${msg.senderId}` : ''} disableHoverListener={!isIdOnly}>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              color: senderColor(msg.senderId),
                              fontFamily: isIdOnly ? 'monospace' : 'inherit',
                              fontSize: isIdOnly ? '0.8rem' : 'inherit',
                            }}
                          >
                            {name}
                          </Typography>
                        </Tooltip>
                        <Tooltip title="修改人名">
                          <IconButton
                            size="small"
                            sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 } }}
                            onClick={() => openSenderRename(msg.senderId, name)}
                          >
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                        {msg.msgType !== 'text' && (
                          <Chip label={msg.msgType} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                        )}
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{ pl: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {msg.content}
                      </Typography>
                    </Paper>
                  </Box>
                );
              })}
            </Box>

            {/* Load More */}
            {page < totalPages && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Button
                  variant="outlined"
                  onClick={() => loadMessages(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? <CircularProgress size={20} /> : '加载更多'}
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chat Rename Dialog */}
      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>重命名对话</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Chat ID: {chatId}
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

      {/* Sender Rename Dialog */}
      <Dialog open={senderRenameOpen} onClose={() => setSenderRenameOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>修改人名</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sender ID: {senderRenameId}
          </Typography>
          <Autocomplete
            freeSolo
            options={assigneeOptions.map(a => a.name)}
            value={senderRenameName}
            onChange={(_e, newValue) => setSenderRenameName(newValue || '')}
            onInputChange={(_e, newValue) => setSenderRenameName(newValue || '')}
            renderInput={(params) => (
              <TextField
                {...params}
                autoFocus
                label="姓名"
                placeholder="选择已有负责人或输入新名字"
                helperText="选择已有负责人，或输入新名字自动创建"
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSenderRenameOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSenderRename}
            disabled={senderRenaming || !senderRenameName.trim()}
          >
            {senderRenaming ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
