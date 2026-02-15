'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Fab,
  Paper,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  CircularProgress,
  Badge,
  Fade,
  Zoom,
  Divider,
  Button,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  Close as CloseIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
  Refresh as RetryIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { designTokens as dt } from '@/lib/theme';

interface Thread {
  id: string;
  chatId: string;
  title: string;
  lastActiveAt: string;
  hasUnread: boolean;
  preview: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string | null;
  status?: string;
  progress?: string | null;
  errorMessage?: string | null;
}

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'threads' | 'chat'>('threads');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<{ chatId: string; title: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastPollTime = useRef<string>(new Date().toISOString());

  // Compute whether any messages are still pending/processing
  const hasPending = useMemo(
    () => messages.some((m) => m.status === 'pending' || m.status === 'processing'),
    [messages]
  );

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load threads when panel opens to threads view
  useEffect(() => {
    if (open && view === 'threads') {
      loadThreads();
    }
  }, [open, view]);

  // ─── Polling logic ───────────────────────────────────────────
  useEffect(() => {
    // Chat closed → poll unread every 10s
    if (!open) {
      const interval = setInterval(pollUnread, 10000);
      // Also poll once immediately on close
      pollUnread();
      return () => clearInterval(interval);
    }

    // Chat open, thread list view → no message polling needed, but keep unread fresh
    if (view === 'threads') {
      return;
    }

    // Chat open, in a conversation
    if (view === 'chat' && activeThread) {
      const delay = hasPending ? 3000 : 10000;
      const interval = setInterval(pollMessages, delay);
      return () => clearInterval(interval);
    }
  }, [open, view, activeThread, hasPending]);

  async function pollUnread() {
    try {
      const res = await fetch('/api/chat/unread');
      const json = await res.json();
      if (json.success) {
        setUnreadCount(json.data.count);
      }
    } catch {
      // silently ignore
    }
  }

  async function pollMessages() {
    if (!activeThread) return;
    try {
      const res = await fetch(
        `/api/chat/poll?threadId=${activeThread.chatId}&since=${encodeURIComponent(lastPollTime.current)}`
      );
      const json = await res.json();
      if (json.success && json.data) {
        const { updates, unreadCount: uc } = json.data;
        if (typeof uc === 'number') setUnreadCount(uc);
        if (Array.isArray(updates) && updates.length > 0) {
          setMessages((prev) => {
            const next = [...prev];
            for (const upd of updates) {
              const idx = next.findIndex((m) => m.id === upd.id);
              if (idx >= 0) {
                next[idx] = { ...next[idx], ...upd };
              } else {
                // New message from server not yet in our list
                next.push(upd);
              }
            }
            return next;
          });
          lastPollTime.current = new Date().toISOString();
        }
      }
    } catch {
      // silently ignore
    }
  }

  // ─── Thread operations ───────────────────────────────────────

  async function loadThreads() {
    setThreadsLoading(true);
    try {
      const res = await fetch('/api/chat');
      const json = await res.json();
      if (json.success) setThreads(json.data);
    } catch (err) {
      console.error('Failed to load threads:', err);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function openThread(thread: Thread) {
    setActiveThread({ chatId: thread.chatId, title: thread.title });
    setView('chat');
    lastPollTime.current = new Date().toISOString();
    try {
      const res = await fetch(`/api/chat/${thread.chatId}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
    // Opening a thread marks messages as read on the server.
    // Refresh unread count after a short delay to let the server process.
    setTimeout(pollUnread, 500);
  }

  function startNewChat() {
    setActiveThread(null);
    setMessages([]);
    setView('chat');
    lastPollTime.current = new Date().toISOString();
  }

  async function deleteThread(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/${chatId}`, { method: 'DELETE' });
      setThreads((prev) => prev.filter((t) => t.chatId !== chatId));
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  }

  function goBack() {
    setView('threads');
    setActiveThread(null);
    setMessages([]);
  }

  function handleOpen() {
    setOpen(true);
  }

  // ─── Send message (optimistic) ──────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    const userTempId = `temp-${Date.now()}`;
    const assistantTempId = `temp-assistant-${Date.now()}`;

    // Optimistically add user message + assistant placeholder
    const userMsg: Message = { id: userTempId, role: 'user', content: text, status: 'done' };
    const assistantMsg: Message = {
      id: assistantTempId,
      role: 'assistant',
      content: null,
      status: 'pending',
      progress: '排队中...',
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: activeThread?.chatId || undefined,
          message: text,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const { threadId, messageId, userMessageId, title } = json.data;
        // Replace temp ids with real ids
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === userTempId) return { ...m, id: userMessageId };
            if (m.id === assistantTempId) return { ...m, id: messageId, status: 'processing', progress: '正在思考...' };
            return m;
          })
        );
        if (!activeThread) {
          setActiveThread({ chatId: threadId, title: title || '新对话' });
        }
        lastPollTime.current = new Date().toISOString();
      } else {
        // Server returned an error
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === assistantTempId) {
              return { ...m, status: 'error', progress: null, errorMessage: json.error || '请求失败，请重试。' };
            }
            return m;
          })
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === assistantTempId) {
            return { ...m, status: 'error', progress: null, errorMessage: '网络错误，请检查连接后重试。' };
          }
          return m;
        })
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, activeThread]);

  // ─── Retry failed message ───────────────────────────────────

  function retryMessage(errorMsgId?: string) {
    if (!errorMsgId) return;

    setMessages((prev) => {
      // Find the error assistant message
      const errIdx = prev.findIndex((m) => m.id === errorMsgId);
      if (errIdx < 0) return prev;

      // The user message is the one right before it
      const userIdx = errIdx - 1;
      if (userIdx < 0 || prev[userIdx].role !== 'user') return prev;

      const userContent = prev[userIdx].content;
      // Remove both messages
      const next = prev.filter((_, i) => i !== errIdx && i !== userIdx);

      // Re-trigger send with that content (after state update)
      if (userContent) {
        setTimeout(() => {
          setInput(userContent);
          // We need to trigger send after input is set
          setTimeout(() => {
            const sendBtn = document.querySelector('[data-chat-send]') as HTMLButtonElement;
            sendBtn?.click();
          }, 50);
        }, 0);
      }

      return next;
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  // ─── Render message bubble ──────────────────────────────────

  function renderMessage(msg: Message, index: number) {
    const isUser = msg.role === 'user';
    const isError = msg.status === 'error';
    const isProcessing = msg.status === 'pending' || msg.status === 'processing';

    return (
      <Box
        key={msg.id || index}
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <Box
          sx={{
            maxWidth: '80%',
            px: 1.5,
            py: 1,
            borderRadius: 2,
            backgroundColor: isUser
              ? dt.accent.main
              : isError
                ? dt.danger.subtle
                : dt.bg.deep,
            color: isUser
              ? '#fff'
              : isError
                ? dt.danger.dark
                : dt.text.primary,
            border: isError ? `1px solid ${alpha(dt.danger.main, 0.2)}` : 'none',
          }}
        >
          {/* Processing state: spinner + progress text */}
          {isProcessing && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} sx={{ color: dt.accent.main }} />
              <Typography variant="caption" sx={{ color: dt.text.secondary }}>
                {msg.progress || '处理中...'}
              </Typography>
            </Box>
          )}

          {/* Error state: error text + retry button */}
          {isError && (
            <Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', mb: 0.5 }}>
                {msg.errorMessage || '处理失败'}
              </Typography>
              <Button
                size="small"
                startIcon={<RetryIcon sx={{ fontSize: 14 }} />}
                onClick={() => retryMessage(msg.id)}
                sx={{
                  color: dt.danger.main,
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  px: 1,
                  py: 0.25,
                  minWidth: 0,
                  '&:hover': { backgroundColor: alpha(dt.danger.main, 0.08) },
                }}
              >
                重试
              </Button>
            </Box>
          )}

          {/* Done / normal content */}
          {!isProcessing && !isError && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content}
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <>
      {/* Floating Action Button with Badge */}
      <Zoom in={!open}>
        <Badge
          badgeContent={unreadCount}
          color="error"
          invisible={unreadCount === 0}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            '& .MuiBadge-badge': {
              top: 6,
              right: 6,
              minWidth: 18,
              height: 18,
              fontSize: '0.7rem',
            },
          }}
        >
          <Fab
            onClick={handleOpen}
            sx={{
              background: `linear-gradient(135deg, ${dt.accent.main} 0%, ${dt.purple.main} 100%)`,
              color: '#fff',
              boxShadow: `0 4px 20px ${alpha(dt.accent.main, 0.35)}`,
              '&:hover': {
                background: `linear-gradient(135deg, ${dt.accent.dark} 0%, ${dt.purple.dark} 100%)`,
              },
            }}
          >
            <SmartToyIcon />
          </Fab>
        </Badge>
      </Zoom>

      {/* Chat Window */}
      <Fade in={open}>
        <Paper
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 400,
            height: 520,
            zIndex: 1300,
            display: open ? 'flex' : 'none',
            flexDirection: 'column',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: `0 8px 32px ${alpha('#0f172a', 0.12)}`,
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              background: `linear-gradient(135deg, ${dt.accent.main} 0%, ${dt.purple.main} 100%)`,
              color: '#fff',
              minHeight: 48,
            }}
          >
            {view === 'chat' && (
              <IconButton size="small" onClick={goBack} sx={{ color: '#fff' }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            )}
            <SmartToyIcon fontSize="small" />
            <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700, color: '#fff' }}>
              {view === 'chat' ? (activeThread?.title || '新对话') : 'AI 助手'}
            </Typography>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#fff' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Thread List View */}
          {view === 'threads' && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ p: 1.5 }}>
                <ListItemButton
                  onClick={startNewChat}
                  sx={{
                    borderRadius: 2,
                    border: `1px dashed ${dt.border.strong}`,
                    justifyContent: 'center',
                    gap: 1,
                  }}
                >
                  <AddIcon fontSize="small" color="primary" />
                  <Typography variant="body2" color="primary" fontWeight={600}>
                    新对话
                  </Typography>
                </ListItemButton>
              </Box>
              <Divider />
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                {threadsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : threads.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    还没有对话，开始一个吧
                  </Typography>
                ) : (
                  <List>
                    {threads.map((t) => (
                      <ListItemButton key={t.chatId} onClick={() => openThread(t)} sx={{ pr: 6 }}>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {t.hasUnread && (
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: dt.danger.main,
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {t.title}
                              </Typography>
                            </Box>
                          }
                          secondary={`${t.preview} · ${formatTime(t.lastActiveAt)}`}
                          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            size="small"
                            onClick={(e) => deleteThread(t.chatId, e)}
                            sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          )}

          {/* Chat View */}
          {view === 'chat' && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Messages */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {messages.length === 0 && !sending && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    有什么我可以帮你的？
                  </Typography>
                )}
                {messages.map((msg, i) => renderMessage(msg, i))}
                <div ref={messagesEndRef} />
              </Box>

              {/* Input */}
              <Box sx={{ p: 1.5, borderTop: `1px solid ${dt.border.default}`, display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="输入消息..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sending}
                  multiline
                  maxRows={3}
                />
                <IconButton
                  data-chat-send
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  sx={{
                    color: dt.accent.main,
                    '&:hover': { backgroundColor: dt.accent.subtle },
                  }}
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          )}
        </Paper>
      </Fade>
    </>
  );
}
