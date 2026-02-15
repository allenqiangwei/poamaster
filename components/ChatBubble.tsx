'use client';

import { useState, useEffect, useRef } from 'react';
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
  Fade,
  Zoom,
  Divider,
} from '@mui/material';
import {
  SmartToy as SmartToyIcon,
  Close as CloseIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Send as SendIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { designTokens as dt } from '@/lib/theme';

interface Thread {
  id: string;
  chatId: string;
  title: string;
  lastActiveAt: string;
  preview: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'threads' | 'chat'>('threads');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<{ chatId: string; title: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load threads when panel opens
  useEffect(() => {
    if (open && view === 'threads') {
      loadThreads();
    }
  }, [open, view]);

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
    try {
      const res = await fetch(`/api/chat/${thread.chatId}`);
      const json = await res.json();
      if (json.success) {
        setMessages(json.data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }

  function startNewChat() {
    setActiveThread(null);
    setMessages([]);
    setView('chat');
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

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
        setMessages((prev) => [...prev, { role: 'assistant', content: json.data.reply }]);
        if (!activeThread) {
          setActiveThread({ chatId: json.data.threadId, title: json.data.title });
        }
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: '抱歉，请求失败，请重试。' }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '网络错误，请检查连接后重试。' }]);
    } finally {
      setLoading(false);
    }
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

  return (
    <>
      {/* Floating Action Button */}
      <Zoom in={!open}>
        <Fab
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
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
                          primary={t.title}
                          secondary={`${t.preview} · ${formatTime(t.lastActiveAt)}`}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
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
                {messages.length === 0 && !loading && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    有什么我可以帮你的？
                  </Typography>
                )}
                {messages.map((msg, i) => (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        maxWidth: '80%',
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        backgroundColor:
                          msg.role === 'user'
                            ? dt.accent.main
                            : dt.bg.deep,
                        color:
                          msg.role === 'user'
                            ? '#fff'
                            : dt.text.primary,
                      }}
                    >
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {loading && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <Box
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        backgroundColor: dt.bg.deep,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <CircularProgress size={16} />
                      <Typography variant="caption" color="text.secondary">
                        Claude 正在思考...
                      </Typography>
                    </Box>
                  </Box>
                )}
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
                  disabled={loading}
                  multiline
                  maxRows={3}
                />
                <IconButton
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
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
