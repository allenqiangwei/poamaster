'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button,
  CircularProgress, Alert, IconButton, ToggleButtonGroup, ToggleButton,
  Divider, Stack, Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as ResolvedIcon,
  Warning as RiskIcon,
  Block as BlockerIcon,
  NotificationsActive as EscalationIcon,
  Lightbulb as DecisionIcon,
  Assignment as ActionIcon,
  Mood as SentimentIcon,
  TrendingUp as TrendIcon,
} from '@mui/icons-material';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip, Legend,
} from 'recharts';
import { designTokens as dt } from '@/lib/theme';

interface Signal {
  id: string;
  chatId: string;
  signalType: string;
  severity: string;
  title: string;
  summary: string;
  relatedUser: string | null;
  isResolved: boolean;
  source: string;
  detectedAt: string;
  chat: { name: string | null };
}

interface ChatHealth {
  chatId: string;
  chatName: string;
  totalMessages: number;
  avgSentiment: number | null;
  trend: Array<{ date: string; messages: number; sentiment: number | null }>;
}

interface Digest {
  id: string;
  chatId: string;
  summary: string;
  keyTopics: string[];
  messageCount: number;
  activeUsers: string[];
  chat: { name: string | null };
}

interface TrendPoint {
  date: string;
  messages: number;
  activeUsers: number;
  sentiment: number | null;
}

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  RISK: <RiskIcon fontSize="small" sx={{ color: dt.danger.main }} />,
  BLOCKER: <BlockerIcon fontSize="small" sx={{ color: dt.warning.main }} />,
  ESCALATION: <EscalationIcon fontSize="small" sx={{ color: dt.purple.main }} />,
  DECISION: <DecisionIcon fontSize="small" sx={{ color: dt.accent.main }} />,
  ACTION: <ActionIcon fontSize="small" sx={{ color: dt.teal.main }} />,
  SENTIMENT: <SentimentIcon fontSize="small" sx={{ color: dt.success.main }} />,
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: dt.danger.main,
  HIGH: dt.warning.main,
  MEDIUM: dt.accent.main,
  LOW: dt.text.muted,
};

export default function TeamPulsePage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [chatHealth, setChatHealth] = useState<ChatHealth[]>([]);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [signalFilter, setSignalFilter] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sigRes, ovRes, dgRes] = await Promise.all([
        fetch(`/api/team-pulse/signals?days=7&resolved=${showResolved}${signalFilter ? `&type=${signalFilter}` : ''}`, { credentials: 'include' }),
        fetch('/api/team-pulse/overview?days=7', { credentials: 'include' }),
        fetch('/api/team-pulse/digests', { credentials: 'include' }),
      ]);

      const sigData = await sigRes.json();
      const ovData = await ovRes.json();
      const dgData = await dgRes.json();

      setSignals(sigData.signals || []);
      setUnresolvedCount(
        Object.values(sigData.unresolvedCounts || {}).reduce((a: number, b: any) => a + b, 0) as number
      );
      setChatHealth(ovData.chatHealth || []);
      setTrend(ovData.trend || []);
      setDigests(dgData.digests || []);
    } catch {
      setError('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [signalFilter, showResolved]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResolve = async (id: string) => {
    try {
      await fetch(`/api/team-pulse/signals/${id}/resolve`, {
        method: 'POST', credentials: 'include',
      });
      loadData();
    } catch { /* ignore */ }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/team-pulse/analyze', {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        loadData();
      }
    } catch {
      setError('分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  const sentimentLabel = (score: number | null) => {
    if (score === null) return { text: '-', color: dt.text.muted };
    if (score >= 0.3) return { text: '\u{1F60A}', color: dt.success.main };
    if (score >= -0.1) return { text: '\u{1F610}', color: dt.warning.main };
    return { text: '\u{1F61F}', color: dt.danger.main };
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const selectedDigest = selectedChat
    ? digests.find(d => d.chatId === selectedChat)
    : null;

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4">团队脉搏</Typography>
          <Typography variant="body2" color="text.secondary">
            从飞书群聊中提取的运营信号和团队动态
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            onClick={handleAnalyze}
            disabled={analyzing}
            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <TrendIcon />}
          >
            {analyzing ? '分析中...' : '立即分析'}
          </Button>
          <IconButton onClick={loadData}><RefreshIcon /></IconButton>
        </Stack>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="error">{unresolvedCount}</Typography>
              <Typography variant="caption" color="text.secondary">未处理信号</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4">{chatHealth.length}</Typography>
              <Typography variant="caption" color="text.secondary">活跃群聊</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4">
                {chatHealth.reduce((s, c) => s + c.totalMessages, 0)}
              </Typography>
              <Typography variant="caption" color="text.secondary">7天消息总量</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4">{digests.length}</Typography>
              <Typography variant="caption" color="text.secondary">今日摘要</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Left Column: Signal Feed */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">信号流</Typography>
                <Button
                  size="small"
                  variant={showResolved ? 'contained' : 'outlined'}
                  onClick={() => setShowResolved(!showResolved)}
                >
                  {showResolved ? '已处理' : '未处理'}
                </Button>
              </Box>

              <ToggleButtonGroup
                value={signalFilter}
                exclusive
                onChange={(_, v) => setSignalFilter(v)}
                size="small"
                sx={{ mb: 2, flexWrap: 'wrap' }}
              >
                <ToggleButton value={null as any}>全部</ToggleButton>
                <ToggleButton value="RISK">风险</ToggleButton>
                <ToggleButton value="BLOCKER">阻塞</ToggleButton>
                <ToggleButton value="ESCALATION">升级</ToggleButton>
                <ToggleButton value="DECISION">决策</ToggleButton>
                <ToggleButton value="ACTION">待办</ToggleButton>
              </ToggleButtonGroup>

              {signals.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  暂无信号
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {signals.map(sig => (
                    <Card key={sig.id} variant="outlined" sx={{
                      borderLeft: `3px solid ${SEVERITY_COLORS[sig.severity] || dt.text.muted}`,
                    }}>
                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {SIGNAL_ICONS[sig.signalType]}
                          <Typography variant="subtitle2" sx={{ flex: 1 }}>{sig.title}</Typography>
                          {!sig.isResolved && (
                            <Tooltip title="标记已处理">
                              <IconButton size="small" onClick={() => handleResolve(sig.id)}>
                                <ResolvedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                          {sig.summary}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                          <Chip label={sig.chat.name || '未命名'} size="small" variant="outlined" />
                          <Chip label={sig.source === 'realtime' ? '实时' : '批量'} size="small"
                            color={sig.source === 'realtime' ? 'warning' : 'default'} variant="outlined" />
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(sig.detectedAt)}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Chat Health + Trend */}
        <Grid size={{ xs: 12, md: 7 }}>
          {/* Chat Health Cards */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>群聊健康度</Typography>
              <Grid container spacing={1.5}>
                {chatHealth.map(ch => {
                  const sent = sentimentLabel(ch.avgSentiment);
                  return (
                    <Grid key={ch.chatId} size={{ xs: 6, sm: 4, md: 3 }}>
                      <Card
                        variant="outlined"
                        sx={{
                          cursor: 'pointer',
                          bgcolor: selectedChat === ch.chatId ? `${dt.accent.main}10` : undefined,
                          '&:hover': { bgcolor: `${dt.accent.main}08` },
                        }}
                        onClick={() => setSelectedChat(
                          selectedChat === ch.chatId ? null : ch.chatId
                        )}
                      >
                        <CardContent sx={{ py: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                          <Typography variant="subtitle2" noWrap>{ch.chatName}</Typography>
                          <Typography variant="h6">{ch.totalMessages}</Typography>
                          <Typography variant="caption" color="text.secondary">条消息</Typography>
                          <Typography variant="body1" sx={{ color: sent.color }}>
                            {sent.text} {ch.avgSentiment !== null ? (ch.avgSentiment > 0 ? '+' : '') + ch.avgSentiment : ''}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
                {chatHealth.length === 0 && (
                  <Grid size={12}>
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      暂无数据，点击"立即分析"开始
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Trend Chart */}
          {trend.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>7天趋势</Typography>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trend.map(t => ({
                    ...t,
                    date: new Date(t.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
                  }))}>
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} tick={{ fontSize: 12 }} />
                    <ReTooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="messages" stroke={dt.accent.main} name="消息数" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="sentiment" stroke={dt.success.main} name="情绪" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Selected Chat Digest */}
          {selectedDigest && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  今日摘要 — {selectedDigest.chat.name || '未命名'}
                </Typography>
                <Typography variant="body1" sx={{ mb: 2 }}>
                  {selectedDigest.summary}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  {selectedDigest.keyTopics.map(t => (
                    <Chip key={t} label={`#${t}`} size="small" color="primary" variant="outlined" />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {selectedDigest.messageCount} 条消息 · {selectedDigest.activeUsers.length} 人参与
                </Typography>
              </CardContent>
            </Card>
          )}

          {/* All digests if no chat selected */}
          {!selectedChat && digests.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>今日群聊摘要</Typography>
                <Stack spacing={2}>
                  {digests.map(d => (
                    <Box key={d.id}>
                      <Typography variant="subtitle2">{d.chat.name || '未命名'}</Typography>
                      <Typography variant="body2" color="text.secondary">{d.summary}</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                        {d.keyTopics.map(t => (
                          <Chip key={t} label={`#${t}`} size="small" variant="outlined" />
                        ))}
                      </Box>
                      <Divider sx={{ mt: 1.5 }} />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
