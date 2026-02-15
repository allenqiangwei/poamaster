'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Button,
  Grid,
  Chip,
  IconButton,
  Fade,
  Grow,
  LinearProgress,
  Divider,
  Avatar,
  Tooltip,
  Snackbar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Chat as ChatIcon,
  CheckCircle as CheckIcon,
  TrendingUp as TrendingIcon,
  AutoAwesome as SparkleIcon,
  Schedule as TimeIcon,
  Forum as RoundtableIcon,
  Assessment as PulseIcon,
  ArrowUpward as ArrowUpIcon,
  FiberManualRecord as DotIcon,
  KeyboardArrowRight as ArrowRightIcon,
  Explore as ExploreIcon,
  Topic as TopicIcon,
  Lightbulb as LightbulbIcon,
  AddCircleOutline as AddCircleIcon,
  Close as CloseIcon,
  MonitorHeart as SentimentIcon,
  NotificationImportant as NotificationImportantIcon,
  Gavel as GavelIcon,
  PriorityHigh as PriorityHighIcon,
} from '@mui/icons-material';

interface DailyData {
  period: { from: string; to: string };
  tasks: {
    overdue: Array<{ title: string; assignee: string; dueDate: string }>;
    completed: number;
    created: number;
    inProgress: number;
  };
  feishu: {
    totalMessages: number;
    topChats: Array<{ name: string; count: number }>;
    topSenders: Array<{ name: string; count: number }>;
  };
  pulse: {
    newReports: number;
    completedAnalyses: number;
  };
  roundtable: {
    completedDiscussions: number;
    newActions: number;
    newRisks: number;
  };
  sentiment?: {
    totalReviews: number;
    positive: number;
    neutral: number;
    negative: number;
    topIssues: Array<{ tag: string; count: number }>;
    games: Array<{ name: string; reviewCount: number; avgRating: number | null }>;
  };
  priorities?: {
    overdueTasks: Array<{ id: string; title: string; assignee: string; dueDate: string }>;
    unresolvedSignals: Array<{ id: string; type: string; severity: string; title: string; chatName: string }>;
    pendingDecisions: Array<{ id: string; title: string; madeBy: string; madeAt: string }>;
  };
}

interface SuggestedTopic {
  id: string;
  name: string;
  reason: string;
  status: string;
}

type PriorityItem = {
  id: string;
  type: 'task' | 'signal' | 'decision';
  title: string;
  detail: string;
  href: string;
};

import { designTokens as dt } from '@/lib/theme';

const COLORS = {
  gradient: 'transparent',
  accent: dt.accent.main,
  accentLight: dt.accent.light,
  success: dt.success.main,
  warning: dt.warning.main,
  danger: dt.danger.main,
  purple: dt.purple.main,
  orange: '#fb923c',
  cardBg: dt.bg.elevated,
  cardBorder: dt.border.default,
  textPrimary: dt.text.primary,
  textSecondary: dt.text.secondary,
  textMuted: dt.text.muted,
};

const CARD_STYLE = {
  background: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: '16px',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    border: `1px solid ${dt.border.strong}`,
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
  },
};

function StatCard({ icon, label, value, color, delay }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  delay: number;
}) {
  return (
    <Grow in timeout={600 + delay}>
      <Card sx={CARD_STYLE} elevation={0}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <Typography
                variant="h3"
                sx={{
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  lineHeight: 1,
                  mb: 0.5,
                  fontFeatureSettings: '"tnum"',
                }}
              >
                {value}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: COLORS.textSecondary, fontWeight: 500, letterSpacing: '0.02em' }}
              >
                {label}
              </Typography>
            </Box>
            <Avatar
              sx={{
                bgcolor: `${color}15`,
                color: color,
                width: 44,
                height: 44,
              }}
            >
              {icon}
            </Avatar>
          </Box>
        </CardContent>
      </Card>
    </Grow>
  );
}

function MiniStatRow({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ color, display: 'flex', opacity: 0.8 }}>{icon}</Box>
        <Typography variant="body2" sx={{ color: COLORS.textSecondary }}>{label}</Typography>
      </Box>
      <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
        {value}
      </Typography>
    </Box>
  );
}

function TopList({ title, items, emptyText }: {
  title: string;
  items: Array<{ name: string; count: number }>;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography variant="caption" sx={{ color: COLORS.textMuted }}>{emptyText}</Typography>
      </Box>
    );
  }

  const maxCount = Math.max(...items.map(i => i.count));

  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        variant="overline"
        sx={{ color: COLORS.textMuted, letterSpacing: '0.1em', fontSize: '0.65rem' }}
      >
        {title}
      </Typography>
      {items.map((item, i) => (
        <Box key={i} sx={{ py: 0.75 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography
              variant="body2"
              sx={{
                color: COLORS.textSecondary,
                maxWidth: '70%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </Typography>
            <Typography variant="body2" sx={{ color: COLORS.textPrimary, fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
              {item.count}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(item.count / maxCount) * 100}
            sx={{
              height: 3,
              borderRadius: 2,
              bgcolor: dt.bg.deep,
              '& .MuiLinearProgress-bar': {
                borderRadius: 2,
                background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.purple})`,
              },
            }}
          />
        </Box>
      ))}
    </Box>
  );
}

/** Render markdown text safely */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <Box>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (trimmed.startsWith('### ')) {
          return (
            <Typography
              key={i}
              variant="subtitle2"
              sx={{
                mt: 2.5,
                mb: 1,
                color: COLORS.accent,
                fontWeight: 600,
                letterSpacing: '0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <DotIcon sx={{ fontSize: 8 }} />
              {trimmed.slice(4)}
            </Typography>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <Typography
              key={i}
              variant="subtitle1"
              sx={{
                mt: 3,
                mb: 1,
                color: COLORS.textPrimary,
                fontWeight: 700,
                borderBottom: `1px solid ${COLORS.cardBorder}`,
                pb: 1,
              }}
            >
              {trimmed.slice(3)}
            </Typography>
          );
        }

        if (trimmed.startsWith('- ')) {
          const text = trimmed.slice(2);
          return (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, pl: 1, mb: 0.75, alignItems: 'flex-start' }}>
              <ArrowRightIcon sx={{ fontSize: 16, color: COLORS.accent, mt: 0.25, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ color: COLORS.textSecondary, lineHeight: 1.7 }}>
                {renderInlineMarkdown(text)}
              </Typography>
            </Box>
          );
        }

        if (!trimmed) {
          return <Box key={i} sx={{ height: 12 }} />;
        }

        return (
          <Typography key={i} variant="body2" sx={{ color: COLORS.textSecondary, mb: 0.5, lineHeight: 1.7 }}>
            {renderInlineMarkdown(trimmed)}
          </Typography>
        );
      })}
    </Box>
  );
}

/** Render inline **bold** text safely */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Typography key={i} component="span" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>
          {part.slice(2, -2)}
        </Typography>
      );
    }
    return part;
  });
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function InsightsPage() {
  const router = useRouter();
  const [briefing, setBriefing] = useState('');
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState<SuggestedTopic[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const loadInsights = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const res = await fetch('/api/insights/daily', {
        method: forceRefresh ? 'POST' : 'GET',
        credentials: 'include',
      });
      const result = await res.json();
      if (result.success) {
        setBriefing(result.briefing);
        setData(result.data);
        setGeneratedAt(result.generatedAt);
        setSuggestedTopics(result.suggestedTopics || []);
      } else {
        setError(result.error || '加载失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const handleSuggestion = async (id: string, action: 'accept' | 'dismiss') => {
    try {
      const res = await fetch(`/api/insights/topics/suggested/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setSuggestedTopics(prev => prev.filter(s => s.id !== id));
        if (action === 'accept') {
          setSnackbar('已添加话题，AI 正在生成关键字搭配...');
        }
      }
    } catch {
      // Silently fail
    }
  };

  const handleGenerateSuggestions = async () => {
    setSuggesting(true);
    try {
      const res = await fetch('/api/insights/topics/suggest', {
        method: 'POST',
        credentials: 'include',
      });
      const result = await res.json();
      if (result.success && result.suggestions?.length > 0) {
        setSuggestedTopics(result.suggestions);
      } else if (result.suggestions?.length === 0) {
        setSnackbar('暂无新话题建议');
      } else {
        setSnackbar(result.error || '生成失败');
      }
    } catch {
      setSnackbar('网络错误');
    } finally {
      setSuggesting(false);
    }
  };

  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Hero Header */}
      <Box
        sx={{
          pt: 1,
          pb: 3,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle background orbs */}
        <Box
          sx={{
            position: 'absolute',
            top: -100,
            right: -50,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: -80,
            left: '20%',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(167, 139, 250, 0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <Fade in timeout={800}>
          <Box sx={{ position: 'relative' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <SparkleIcon sx={{ color: COLORS.accent, fontSize: 20 }} />
              <Chip
                label="AI 驱动"
                size="small"
                sx={{
                  bgcolor: `${dt.accent.subtle}`,
                  color: COLORS.accent,
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  height: 24,
                  border: `1px solid ${dt.accent.border}`,
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 800,
                    color: COLORS.textPrimary,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    mb: 0.5,
                  }}
                >
                  {getGreeting()}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ color: COLORS.textMuted, fontWeight: 400 }}
                >
                  {dateStr}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  startIcon={<ExploreIcon />}
                  onClick={() => router.push('/insights/briefing')}
                  sx={{
                    color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: '12px',
                    textTransform: 'none',
                    '&:hover': {
                      color: COLORS.accent,
                      borderColor: dt.accent.border,
                      bgcolor: dt.accent.subtle,
                    },
                  }}
                >
                  洞察简报
                </Button>
                <Button
                  size="small"
                  startIcon={<TopicIcon />}
                  onClick={() => router.push('/insights/topics')}
                  sx={{
                    color: COLORS.textSecondary,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: '12px',
                    textTransform: 'none',
                    '&:hover': {
                      color: COLORS.accent,
                      borderColor: dt.accent.border,
                      bgcolor: dt.accent.subtle,
                    },
                  }}
                >
                  话题管理
                </Button>
                <Tooltip title="重新生成简报" arrow>
                  <span>
                    <IconButton
                      onClick={() => loadInsights(true)}
                      disabled={refreshing || loading}
                      sx={{
                        color: COLORS.textSecondary,
                        border: `1px solid ${COLORS.cardBorder}`,
                        borderRadius: '12px',
                        p: 1.5,
                        transition: 'all 0.2s',
                        '&:hover': {
                          color: COLORS.accent,
                          borderColor: dt.accent.border,
                          bgcolor: dt.accent.subtle,
                        },
                      }}
                    >
                      {refreshing ? <CircularProgress size={20} sx={{ color: COLORS.accent }} /> : <RefreshIcon />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        </Fade>
      </Box>

      {/* Refreshing indicator */}
      {refreshing && (
        <LinearProgress
          sx={{
            height: 2,
            bgcolor: 'transparent',
            '& .MuiLinearProgress-bar': {
              background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.purple})`,
            },
          }}
        />
      )}

      {/* Content */}
      <Box>
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              bgcolor: dt.danger.subtle,
              color: COLORS.danger,
              border: `1px solid rgba(239, 68, 68, 0.15)`,
              '& .MuiAlert-icon': { color: COLORS.danger },
            }}
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12, gap: 3 }}>
            <Box sx={{ position: 'relative' }}>
              <CircularProgress
                size={48}
                thickness={3}
                sx={{
                  color: COLORS.accent,
                  '& .MuiCircularProgress-circle': {
                    strokeLinecap: 'round',
                  },
                }}
              />
            </Box>
            <Typography variant="body2" sx={{ color: COLORS.textMuted }}>
              正在收集数据并生成简报...
            </Typography>
          </Box>
        ) : data && (
          <>
            {/* Stat Cards Row */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard
                  icon={<WarningIcon fontSize="small" />}
                  label="逾期任务"
                  value={data.tasks.overdue.length}
                  color={data.tasks.overdue.length > 0 ? COLORS.danger : COLORS.success}
                  delay={0}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard
                  icon={<ChatIcon fontSize="small" />}
                  label="飞书消息"
                  value={data.feishu.totalMessages}
                  color={COLORS.accent}
                  delay={100}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard
                  icon={<CheckIcon fontSize="small" />}
                  label="已完成任务"
                  value={data.tasks.completed}
                  color={COLORS.success}
                  delay={200}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <StatCard
                  icon={<TrendingIcon fontSize="small" />}
                  label="进行中"
                  value={data.tasks.inProgress}
                  color={COLORS.warning}
                  delay={300}
                />
              </Grid>
            </Grid>

            {/* Priority Queue */}
            {(() => {
              const priorityItems: PriorityItem[] = [
                ...(data?.priorities?.overdueTasks || []).map(t => ({
                  id: t.id,
                  type: 'task' as const,
                  title: t.title,
                  detail: `${t.assignee} · 逾期 ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('zh-CN') : ''}`,
                  href: `/todo/${t.id}`,
                })),
                ...(data?.priorities?.unresolvedSignals || []).map(s => ({
                  id: s.id,
                  type: 'signal' as const,
                  title: s.title,
                  detail: `${s.severity} · ${s.chatName}`,
                  href: '/feishu/pulse',
                })),
                ...(data?.priorities?.pendingDecisions || []).map(d => ({
                  id: d.id,
                  type: 'decision' as const,
                  title: d.title,
                  detail: `${d.madeBy} · ${new Date(d.madeAt).toLocaleDateString('zh-CN')}`,
                  href: `/decisions/${d.id}`,
                })),
              ];

              const priorityConfig = {
                task: {
                  icon: <WarningIcon sx={{ fontSize: 18 }} />,
                  label: '任务',
                  chipColor: COLORS.warning,
                  chipBg: `${COLORS.warning}18`,
                },
                signal: {
                  icon: <NotificationImportantIcon sx={{ fontSize: 18 }} />,
                  label: '信号',
                  chipColor: COLORS.danger,
                  chipBg: `${COLORS.danger}18`,
                },
                decision: {
                  icon: <GavelIcon sx={{ fontSize: 18 }} />,
                  label: '决策',
                  chipColor: COLORS.accent,
                  chipBg: `${COLORS.accent}18`,
                },
              };

              return (
                <Fade in timeout={700}>
                  <Card
                    sx={{
                      ...CARD_STYLE,
                      mb: 3,
                      borderLeft: `3px solid ${COLORS.warning}`,
                      '&:hover': { ...CARD_STYLE['&:hover'], transform: 'none' },
                    }}
                    elevation={0}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: priorityItems.length > 0 ? 2 : 0 }}>
                        <PriorityHighIcon sx={{ color: COLORS.warning, fontSize: 20 }} />
                        <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
                          今日优先事项
                        </Typography>
                        {priorityItems.length > 0 && (
                          <Chip
                            label={priorityItems.length}
                            size="small"
                            sx={{
                              ml: 'auto',
                              bgcolor: `${COLORS.warning}18`,
                              color: COLORS.warning,
                              fontWeight: 700,
                              fontSize: '0.7rem',
                              height: 22,
                              minWidth: 22,
                            }}
                          />
                        )}
                      </Box>

                      {priorityItems.length === 0 ? (
                        <Typography variant="body2" sx={{ color: COLORS.textMuted, textAlign: 'center', py: 1 }}>
                          暂无优先事项
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {priorityItems.map((item) => {
                            const config = priorityConfig[item.type];
                            return (
                              <Box
                                key={`${item.type}-${item.id}`}
                                onClick={() => router.push(item.href)}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1.5,
                                  p: 1.5,
                                  borderRadius: '12px',
                                  bgcolor: dt.bg.deep,
                                  border: `1px solid ${dt.border.default}`,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  '&:hover': {
                                    bgcolor: dt.bg.elevated,
                                    borderColor: dt.border.strong,
                                    transform: 'translateX(4px)',
                                  },
                                }}
                              >
                                <Avatar
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    bgcolor: config.chipBg,
                                    color: config.chipColor,
                                  }}
                                >
                                  {config.icon}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      color: COLORS.textPrimary,
                                      fontWeight: 600,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {item.title}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                    {item.detail}
                                  </Typography>
                                </Box>
                                <Chip
                                  label={config.label}
                                  size="small"
                                  sx={{
                                    bgcolor: config.chipBg,
                                    color: config.chipColor,
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    height: 22,
                                    border: `1px solid ${config.chipColor}30`,
                                    flexShrink: 0,
                                  }}
                                />
                                <ArrowRightIcon sx={{ color: COLORS.textMuted, fontSize: 18, flexShrink: 0 }} />
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Fade>
              );
            })()}

            {/* Topic Suggestion: Button + Results */}
            <Card sx={{ ...CARD_STYLE, mb: 3, '&:hover': { ...CARD_STYLE['&:hover'], transform: 'none' } }} elevation={0}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: suggestedTopics.length > 0 ? 2 : 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LightbulbIcon sx={{ color: COLORS.warning, fontSize: 18 }} />
                    <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
                      话题推荐
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    onClick={handleGenerateSuggestions}
                    disabled={suggesting}
                    startIcon={suggesting ? <CircularProgress size={14} sx={{ color: COLORS.accent }} /> : <SparkleIcon sx={{ fontSize: 16 }} />}
                    sx={{
                      color: COLORS.accent,
                      border: `1px solid ${dt.accent.border}`,
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      px: 2,
                      '&:hover': {
                        bgcolor: dt.accent.subtle,
                        borderColor: COLORS.accent,
                      },
                    }}
                  >
                    {suggesting ? 'AI 分析中...' : 'AI 推荐话题'}
                  </Button>
                </Box>

                {suggestedTopics.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {suggestedTopics.map((s) => (
                      <Box
                        key={s.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          p: 1.5,
                          borderRadius: '12px',
                          bgcolor: dt.bg.deep,
                          border: `1px solid ${dt.border.default}`,
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 600 }}>
                            {s.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: COLORS.textSecondary, fontSize: '0.82rem' }}>
                            {s.reason}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          <Tooltip title="采纳话题" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleSuggestion(s.id, 'accept')}
                              sx={{
                                color: COLORS.success,
                                border: `1px solid ${COLORS.success}30`,
                                '&:hover': { bgcolor: dt.success.subtle },
                              }}
                            >
                              <AddCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="忽略" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleSuggestion(s.id, 'dismiss')}
                              sx={{
                                color: COLORS.textMuted,
                                '&:hover': { bgcolor: dt.danger.subtle, color: COLORS.danger },
                              }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}

                {suggestedTopics.length === 0 && !suggesting && (
                  <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, textAlign: 'center' }}>
                    点击「AI 推荐话题」，根据飞书对话和项目数据生成话题建议
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* Main Content Grid */}
            <Grid container spacing={2.5}>
              {/* AI Briefing — Main Column */}
              <Grid size={{ xs: 12, md: 8 }}>
                <Fade in timeout={1000}>
                  <Card sx={{ ...CARD_STYLE, '&:hover': { ...CARD_STYLE['&:hover'], transform: 'none' } }} elevation={0}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                        <SparkleIcon sx={{ color: COLORS.accent, fontSize: 20 }} />
                        <Typography
                          variant="subtitle1"
                          sx={{ color: COLORS.textPrimary, fontWeight: 700 }}
                        >
                          AI 简报
                        </Typography>
                        {generatedAt && (
                          <Chip
                            icon={<TimeIcon sx={{ fontSize: '14px !important' }} />}
                            label={new Date(generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            size="small"
                            sx={{
                              ml: 'auto',
                              bgcolor: dt.bg.deep,
                              color: COLORS.textMuted,
                              fontSize: '0.7rem',
                              height: 24,
                              border: `1px solid ${COLORS.cardBorder}`,
                              '& .MuiChip-icon': { color: COLORS.textMuted },
                            }}
                          />
                        )}
                      </Box>
                      <MarkdownContent content={briefing} />
                    </CardContent>
                  </Card>
                </Fade>
              </Grid>

              {/* Sidebar — Details */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  {/* Overdue Tasks */}
                  {data.tasks.overdue.length > 0 && (
                    <Fade in timeout={1100}>
                      <Card
                        sx={{
                          ...CARD_STYLE,
                          borderColor: `rgba(239, 68, 68, 0.12)`,
                        }}
                        elevation={0}
                      >
                        <CardContent sx={{ p: 2.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <WarningIcon sx={{ color: COLORS.danger, fontSize: 18 }} />
                            <Typography variant="subtitle2" sx={{ color: COLORS.danger, fontWeight: 700 }}>
                              逾期任务
                            </Typography>
                            <Chip
                              label={data.tasks.overdue.length}
                              size="small"
                              sx={{
                                ml: 'auto',
                                bgcolor: dt.danger.subtle,
                                color: COLORS.danger,
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                height: 22,
                                minWidth: 22,
                              }}
                            />
                          </Box>
                          {data.tasks.overdue.slice(0, 5).map((task, i) => (
                            <Box
                              key={i}
                              sx={{
                                py: 1,
                                borderBottom: i < Math.min(data.tasks.overdue.length, 5) - 1 ? `1px solid ${COLORS.cardBorder}` : 'none',
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  color: COLORS.textSecondary,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  mb: 0.25,
                                }}
                              >
                                {task.title}
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 1.5 }}>
                                <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                                  {task.assignee}
                                </Typography>
                                <Typography variant="caption" sx={{ color: COLORS.danger }}>
                                  {task.dueDate}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </CardContent>
                      </Card>
                    </Fade>
                  )}

                  {/* Activity Summary */}
                  <Fade in timeout={1200}>
                    <Card sx={CARD_STYLE} elevation={0}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700, mb: 1 }}>
                          活动概览
                        </Typography>
                        <MiniStatRow
                          icon={<ArrowUpIcon sx={{ fontSize: 16 }} />}
                          label="新建任务"
                          value={data.tasks.created}
                          color={COLORS.accent}
                        />
                        <MiniStatRow
                          icon={<PulseIcon sx={{ fontSize: 16 }} />}
                          label="新增报告"
                          value={data.pulse.newReports}
                          color={COLORS.purple}
                        />
                        <MiniStatRow
                          icon={<PulseIcon sx={{ fontSize: 16 }} />}
                          label="完成分析"
                          value={data.pulse.completedAnalyses}
                          color={COLORS.success}
                        />
                        <MiniStatRow
                          icon={<RoundtableIcon sx={{ fontSize: 16 }} />}
                          label="圆桌讨论"
                          value={data.roundtable.completedDiscussions}
                          color={COLORS.orange}
                        />
                        <MiniStatRow
                          icon={<WarningIcon sx={{ fontSize: 16 }} />}
                          label="新增风险"
                          value={data.roundtable.newRisks}
                          color={COLORS.danger}
                        />
                      </CardContent>
                    </Card>
                  </Fade>

                  {/* Top Chats */}
                  <Fade in timeout={1300}>
                    <Card sx={CARD_STYLE} elevation={0}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <ChatIcon sx={{ color: COLORS.accent, fontSize: 18 }} />
                          <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
                            飞书动态
                          </Typography>
                        </Box>
                        <TopList
                          title="活跃对话"
                          items={data.feishu.topChats}
                          emptyText="暂无对话数据"
                        />
                        {data.feishu.topSenders.length > 0 && (
                          <>
                            <Divider sx={{ my: 1.5, borderColor: COLORS.cardBorder }} />
                            <TopList
                              title="活跃成员"
                              items={data.feishu.topSenders}
                              emptyText="暂无成员数据"
                            />
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Fade>

                  {/* Sentiment Summary */}
                  {data.sentiment && data.sentiment.totalReviews > 0 && (
                    <Fade in timeout={1400}>
                      <Card sx={CARD_STYLE} elevation={0}>
                        <CardContent sx={{ p: 2.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <SentimentIcon sx={{ color: COLORS.danger, fontSize: 18 }} />
                            <Typography variant="subtitle2" sx={{ color: COLORS.textPrimary, fontWeight: 700 }}>
                              舆情监控
                            </Typography>
                            <Chip
                              label={`${data.sentiment.totalReviews} 条`}
                              size="small"
                              sx={{
                                ml: 'auto',
                                bgcolor: dt.bg.deep,
                                color: COLORS.textMuted,
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                height: 22,
                              }}
                            />
                          </Box>
                          <MiniStatRow
                            icon={<CheckIcon sx={{ fontSize: 16 }} />}
                            label="正面评论"
                            value={data.sentiment.positive}
                            color={COLORS.success}
                          />
                          <MiniStatRow
                            icon={<DotIcon sx={{ fontSize: 16 }} />}
                            label="中性评论"
                            value={data.sentiment.neutral}
                            color={COLORS.warning}
                          />
                          <MiniStatRow
                            icon={<WarningIcon sx={{ fontSize: 16 }} />}
                            label="负面评论"
                            value={data.sentiment.negative}
                            color={COLORS.danger}
                          />
                          {data.sentiment.topIssues.length > 0 && (
                            <>
                              <Divider sx={{ my: 1.5, borderColor: COLORS.cardBorder }} />
                              <TopList
                                title="热点问题"
                                items={data.sentiment.topIssues.map(i => ({ name: i.tag, count: i.count }))}
                                emptyText="暂无问题数据"
                              />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </Fade>
                  )}
                </Box>
              </Grid>
            </Grid>
          </>
        )}
      </Box>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
