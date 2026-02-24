'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  Grid,
  Divider,
  Card,
  CardContent,
  Snackbar,
} from '@mui/material';
import {
  Psychology as BrainIcon,
  CalendarToday as CalendarIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendIcon,
  Assignment as ActionIcon,
  Visibility as ViewIcon,
  AddTask as AddTaskIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import ReactMarkdown from 'react-markdown';

interface CooSnapshot {
  date: string;
  tasks: { total: number; byStatus: Record<string, number>; createdToday: number; completedToday: number; overdueCount: number };
  decisions: { total: number; executionRate: number; overdueList: Array<{ title: string }> };
  okr: { totalObjectives: number; avgKrProgress: number; atRiskKrs: Array<{ title: string; progress: number }> };
  teamPulse: { todayMessages: number; activeUsers: number };
  sentiment: { totalReviews: number; positive: number; negative: number; activeAlerts: number };
  competitors: { newNews: number; newReviews: number };
  feishu: { todayMessages: number; activeChats: number; unresolvedSignals: number; recentSignals?: Array<{ severity: string; title: string }>; messageDigest?: Array<{ chat: string; sender: string; content: string }> };
}

interface BriefingData {
  episode: {
    date: string;
    narrative: string;
    changes: string;
    actions: string;
    snapshot: CooSnapshot;
  } | null;
  core: {
    content: string;
    version: number;
    updatedAt: string;
  } | null;
  availableDates: string[];
}

export default function CooBriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showCore, setShowCore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedTasks, setAddedTasks] = useState<Set<number>>(new Set());
  const [addingTask, setAddingTask] = useState<number | null>(null);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  /**
   * Parse actions markdown (numbered list) into individual items.
   * Each item: { index, title (bold part), fullText (entire item) }
   */
  const parseActionItems = (actionsMarkdown: string): Array<{ index: number; title: string; fullText: string }> => {
    // Split by numbered list items: "1. ", "2. ", etc.
    const items: Array<{ index: number; title: string; fullText: string }> = [];
    const lines = actionsMarkdown.split('\n');
    let current: { index: number; lines: string[] } | null = null;

    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s+(.*)$/);
      if (match) {
        if (current) {
          items.push(buildItem(current));
        }
        current = { index: parseInt(match[1]), lines: [match[2]] };
      } else if (current && line.trim()) {
        current.lines.push(line);
      }
    }
    if (current) {
      items.push(buildItem(current));
    }
    return items;

    function buildItem(item: { index: number; lines: string[] }): { index: number; title: string; fullText: string } {
      const fullText = item.lines.join('\n');
      // Extract bold text as title: **...** or first sentence
      const boldMatch = fullText.match(/\*\*(.+?)\*\*/);
      const title = boldMatch ? boldMatch[1] : fullText.substring(0, 80);
      return { index: item.index, title, fullText };
    }
  };

  const handleAddTask = async (item: { index: number; title: string; fullText: string }) => {
    setAddingTask(item.index);
    try {
      // Strip markdown formatting for the task description
      const cleanText = item.fullText.replace(/\*\*/g, '');
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title.substring(0, 100),
          dod: `[COO简报行动建议]\n${cleanText}`,
        }),
      });
      if (!res.ok) {
        throw new Error('创建失败');
      }
      setAddedTasks(prev => new Set(prev).add(item.index));
      setSnackMsg(`已添加任务: ${item.title.substring(0, 30)}...`);
    } catch (err) {
      setSnackMsg('添加任务失败，请重试');
    } finally {
      setAddingTask(null);
    }
  };

  const fetchBriefing = async (date?: string) => {
    setLoading(true);
    try {
      const url = date ? `/api/coo/briefing?date=${date}` : '/api/coo/briefing';
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      if (json.episode) {
        setSelectedDate(json.episode.date.split('T')[0]);
      } else if (json.availableDates?.length > 0) {
        setSelectedDate(json.availableDates[0]);
      }
    } catch (err) {
      console.error('Failed to fetch briefing:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBriefing(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/coo/memory/generate', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `生成失败 (${res.status})`);
      }
      await fetchBriefing();
    } catch (err: any) {
      console.error('Generation failed:', err);
      setError(err.message || '生成失败，请查看服务端日志');
    } finally {
      setGenerating(false);
    }
  };

  const navigateDate = (direction: number) => {
    if (!data?.availableDates) return;
    const idx = data.availableDates.indexOf(selectedDate);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < data.availableDates.length) {
      const newDate = data.availableDates[newIdx];
      setSelectedDate(newDate);
      fetchBriefing(newDate);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const episode = data?.episode;
  const snapshot = episode?.snapshot;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 3, px: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BrainIcon sx={{ fontSize: 28, color: dt.accent.main }} />
          <Typography variant="h5" fontWeight={700}>COO 智能简报</Typography>
          {data?.core && (
            <Chip
              label={`认知 v${data.core.version}`}
              size="small"
              sx={{ bgcolor: dt.accent.main, color: '#fff' }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="上一天">
            <span>
              <IconButton
                onClick={() => navigateDate(1)}
                disabled={!data?.availableDates || data.availableDates.indexOf(selectedDate) >= data.availableDates.length - 1}
              >
                <PrevIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Chip icon={<CalendarIcon />} label={selectedDate || '暂无数据'} variant="outlined" />
          <Tooltip title="下一天">
            <span>
              <IconButton
                onClick={() => navigateDate(-1)}
                disabled={!data?.availableDates || data.availableDates.indexOf(selectedDate) <= 0}
              >
                <NextIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ViewIcon />}
            onClick={() => setShowCore(!showCore)}
          >
            {showCore ? '隐藏认知' : '查看认知'}
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '生成中...' : '立即生成'}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {generating && (
        <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 2 }}>
          正在生成 COO 简报（数据采集 → AI 分析 → 记忆更新），通常需要 1-3 分钟...
        </Alert>
      )}

      {!episode && !generating && (
        <Alert severity="info" sx={{ mb: 3 }}>
          今日尚未生成 COO 简报。点击"立即生成"手动触发，或等待每晚 21:50 自动生成。
        </Alert>
      )}

      {/* Core Memory Panel */}
      {showCore && data?.core && (
        <Paper sx={{ p: 3, mb: 3, bgcolor: dt.bg.deep, border: `1px solid ${dt.border.default}` }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BrainIcon /> COO 认知模型
            <Chip label={`v${data.core.version}`} size="small" />
          </Typography>
          <Box sx={{ '& h2': { fontSize: '1.1rem', mt: 2 }, '& ul': { pl: 2 }, '& li': { mb: 0.5 } }}>
            <ReactMarkdown>{data.core.content}</ReactMarkdown>
          </Box>
        </Paper>
      )}

      {episode && snapshot && (
        <>
          {/* KPI Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: '任务总数', value: snapshot.tasks.total, sub: `完成 ${snapshot.tasks.completedToday} | 逾期 ${snapshot.tasks.overdueCount}` },
              { label: '决策执行率', value: `${snapshot.decisions.executionRate}%`, sub: `总 ${snapshot.decisions.total} 个决策` },
              { label: 'OKR 进度', value: `${snapshot.okr.avgKrProgress}%`, sub: `${snapshot.okr.atRiskKrs.length} 个风险 KR` },
              { label: '飞书活跃', value: snapshot.feishu.todayMessages, sub: `${snapshot.feishu.activeChats} 个活跃群` },
              { label: '舆情', value: snapshot.sentiment.totalReviews, sub: `负面 ${snapshot.sentiment.negative} | 警报 ${snapshot.sentiment.activeAlerts}` },
              { label: '竞品动态', value: snapshot.competitors.newNews, sub: `新评论 ${snapshot.competitors.newReviews}` },
            ].map((card, i) => (
              <Grid size={{ xs: 6, sm: 4, md: 2 }} key={i}>
                <Card sx={{ textAlign: 'center', bgcolor: dt.bg.elevated, border: `1px solid ${dt.border.subtle}` }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                    <Typography variant="h5" fontWeight={700} sx={{ color: dt.accent.main }}>{card.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{card.sub}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Main Content: Narrative + Actions */}
          <Grid container spacing={3}>
            {/* Left: Narrative + Changes */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper sx={{ p: 3, mb: 3, border: `1px solid ${dt.border.subtle}` }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendIcon /> 今日复盘
                </Typography>
                <Box sx={{ '& h3': { fontSize: '1rem', mt: 2 }, '& ul': { pl: 2 }, '& li': { mb: 0.5 } }}>
                  <ReactMarkdown>{episode.narrative}</ReactMarkdown>
                </Box>
              </Paper>

              {episode.changes && (
                <Paper sx={{ p: 3, border: `1px solid ${dt.border.subtle}` }}>
                  <Typography variant="h6" gutterBottom>变化检测</Typography>
                  <Box sx={{ '& ul': { pl: 2 }, '& li': { mb: 0.5 } }}>
                    <ReactMarkdown>{episode.changes}</ReactMarkdown>
                  </Box>
                </Paper>
              )}
            </Grid>

            {/* Right: Actions */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper sx={{ p: 3, border: `2px solid ${dt.accent.main}`, bgcolor: dt.bg.deep }}>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: dt.accent.main }}>
                  <ActionIcon /> 行动建议
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {parseActionItems(episode.actions).map((item) => (
                  <Box
                    key={item.index}
                    sx={{
                      mb: 2,
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: dt.bg.elevated,
                      border: `1px solid ${addedTasks.has(item.index) ? dt.success.main : dt.border.subtle}`,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <Box sx={{ '& p': { m: 0, fontSize: '0.875rem', lineHeight: 1.7 } }}>
                      <ReactMarkdown>{`${item.index}. ${item.fullText}`}</ReactMarkdown>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                      <Button
                        size="small"
                        variant={addedTasks.has(item.index) ? 'outlined' : 'text'}
                        startIcon={
                          addingTask === item.index
                            ? <CircularProgress size={14} />
                            : addedTasks.has(item.index)
                              ? <CheckIcon sx={{ fontSize: 16 }} />
                              : <AddTaskIcon sx={{ fontSize: 16 }} />
                        }
                        disabled={addedTasks.has(item.index) || addingTask === item.index}
                        onClick={() => handleAddTask(item)}
                        sx={{
                          fontSize: '0.75rem',
                          py: 0.25,
                          color: addedTasks.has(item.index) ? dt.success.main : dt.accent.main,
                          borderColor: addedTasks.has(item.index) ? dt.success.main : undefined,
                        }}
                      >
                        {addedTasks.has(item.index) ? '已加入' : '加入任务'}
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg(null)}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
