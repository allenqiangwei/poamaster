'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Button,
  Chip,
  IconButton,
  Fade,
  Collapse,
  Tooltip,
  LinearProgress,
  Snackbar,
} from '@mui/material';
import {
  AutoAwesome as SparkleIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Today as TodayIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  BusinessCenter as BusinessCenterIcon,
  Code as CodeIcon,
  Lightbulb as LightbulbIcon,
  ThumbUp as ThumbUpIcon,
  ThumbUpOutlined as ThumbUpOutlinedIcon,
  ThumbDown as ThumbDownIcon,
  ThumbDownOutlined as ThumbDownOutlinedIcon,
  ExpandMore as ExpandMoreIcon,
  OpenInNew as OpenInNewIcon,
  Visibility as VisibilityIcon,
  KeyboardArrowRight as ArrowRightIcon,
  FiberManualRecord as DotIcon,
  Settings as SettingsIcon,
  AddCircleOutline as AddCircleIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';

// ─── Types ─────────────────────────────────────────────────
interface Source {
  title: string;
  url: string;
}

interface BriefingCard {
  id: string;
  category: string;
  priority: string;
  title: string;
  summary: string;
  details: string;
  impact: string | null;
  action: string | null;
  sources: Source[];
  feedback: number | null;
  viewedAt: string | null;
}

interface SuggestedTopic {
  id: string;
  name: string;
  reason: string;
  status: string;
}

interface Briefing {
  id: string;
  date: string;
  summary: string;
  status: string;
  cardCount: number;
  cards: BriefingCard[];
  suggestedTopics: SuggestedTopic[];
}

// ─── Styles ────────────────────────────────────────────────
const CARD_STYLE = {
  background: dt.bg.elevated,
  border: `1px solid ${dt.border.default}`,
  borderRadius: '16px',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    border: `1px solid ${dt.border.strong}`,
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
  },
};

// ─── Category Config ───────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  risk: { label: '风险', color: dt.danger.main, icon: <WarningIcon /> },
  industry: { label: '行业', color: dt.accent.main, icon: <TrendingUpIcon /> },
  competitor: { label: '竞品', color: dt.purple.main, icon: <PeopleIcon /> },
  internal: { label: '内部', color: dt.teal.main, icon: <BusinessCenterIcon /> },
  tech: { label: '技术', color: dt.success.main, icon: <CodeIcon /> },
  opportunity: { label: '机会', color: dt.warning.main, icon: <LightbulbIcon /> },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: dt.danger.main },
  medium: { label: '中', color: dt.warning.main },
  low: { label: '低', color: dt.text.muted },
};

// ─── Helpers ───────────────────────────────────────────────
function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Render inline **bold** text */
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Typography key={i} component="span" sx={{ fontWeight: 700, color: dt.text.primary }}>
          {part.slice(2, -2)}
        </Typography>
      );
    }
    return part;
  });
}

/** Render markdown-ish content */
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
                color: dt.accent.main,
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
                color: dt.text.primary,
                fontWeight: 700,
                borderBottom: `1px solid ${dt.border.default}`,
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
              <ArrowRightIcon sx={{ fontSize: 16, color: dt.accent.main, mt: 0.25, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ color: dt.text.secondary, lineHeight: 1.7 }}>
                {renderInlineMarkdown(text)}
              </Typography>
            </Box>
          );
        }

        if (!trimmed) {
          return <Box key={i} sx={{ height: 12 }} />;
        }

        return (
          <Typography key={i} variant="body2" sx={{ color: dt.text.secondary, mb: 0.5, lineHeight: 1.7 }}>
            {renderInlineMarkdown(trimmed)}
          </Typography>
        );
      })}
    </Box>
  );
}

// ─── Status Badge ──────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'generating') {
    return (
      <Chip
        icon={<CircularProgress size={12} thickness={5} sx={{ color: dt.warning.main }} />}
        label="生成中"
        size="small"
        sx={{
          height: 26,
          fontSize: '0.72rem',
          fontWeight: 600,
          bgcolor: dt.warning.subtle,
          color: dt.warning.dark,
          border: '1px solid rgba(245, 158, 11, 0.2)',
          '& .MuiChip-icon': { ml: 0.5 },
        }}
      />
    );
  }
  if (status === 'ready') {
    return (
      <Chip
        icon={<CheckCircleIcon sx={{ fontSize: '16px !important' }} />}
        label="已就绪"
        size="small"
        sx={{
          height: 26,
          fontSize: '0.72rem',
          fontWeight: 600,
          bgcolor: dt.success.subtle,
          color: dt.success.main,
          border: '1px solid rgba(16, 185, 129, 0.2)',
          '& .MuiChip-icon': { color: `${dt.success.main} !important` },
        }}
      />
    );
  }
  if (status === 'sent') {
    return (
      <Chip
        icon={<CheckCircleIcon sx={{ fontSize: '16px !important' }} />}
        label="已发送"
        size="small"
        sx={{
          height: 26,
          fontSize: '0.72rem',
          fontWeight: 600,
          bgcolor: dt.accent.subtle,
          color: dt.accent.main,
          border: `1px solid ${dt.accent.border}`,
          '& .MuiChip-icon': { color: `${dt.accent.main} !important` },
        }}
      />
    );
  }
  return null;
}

// ─── Briefing Card Component ───────────────────────────────
function BriefingCardItem({
  card,
  onFeedback,
}: {
  card: BriefingCard;
  onFeedback: (id: string, feedback: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const viewedRef = useRef(false);

  const cat = CATEGORY_CONFIG[card.category] || {
    label: card.category,
    color: dt.text.muted,
    icon: <SparkleIcon />,
  };
  const pri = PRIORITY_CONFIG[card.priority] || { label: card.priority, color: dt.text.muted };

  // Auto-mark as viewed when expanded
  useEffect(() => {
    if (expanded && !card.viewedAt && !viewedRef.current) {
      viewedRef.current = true;
      fetch(`/api/insights/cards/${card.id}/view`, {
        method: 'PUT',
        credentials: 'include',
      }).catch(() => {});
    }
  }, [expanded, card.viewedAt, card.id]);

  return (
    <Card
      sx={{
        ...CARD_STYLE,
        cursor: 'pointer',
        '&:hover': {
          ...CARD_STYLE['&:hover'],
          transform: expanded ? 'none' : 'translateY(-2px)',
        },
      }}
      elevation={0}
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        {/* Collapsed header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          {/* Left: category icon + chip */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: `${cat.color}12`,
                color: cat.color,
              }}
            >
              {cat.icon}
            </Box>
            <Chip
              label={cat.label}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 600,
                bgcolor: `${cat.color}12`,
                color: cat.color,
                border: `1px solid ${cat.color}30`,
              }}
            />
          </Box>

          {/* Center: title + summary */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                color: dt.text.primary,
                lineHeight: 1.4,
                mb: 0.5,
              }}
            >
              {card.title}
            </Typography>
            {!expanded && (
              <Typography
                variant="body2"
                sx={{
                  color: dt.text.secondary,
                  lineHeight: 1.6,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {card.summary}
              </Typography>
            )}
          </Box>

          {/* Right: priority + feedback + expand */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Chip
              label={pri.label}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.68rem',
                fontWeight: 600,
                bgcolor: `${pri.color}12`,
                color: pri.color,
                border: `1px solid ${pri.color}30`,
              }}
            />
            {/* Feedback buttons */}
            <Box sx={{ display: 'flex', gap: 0 }} onClick={(e) => e.stopPropagation()}>
              <Tooltip title="有用" arrow>
                <IconButton
                  size="small"
                  onClick={() => onFeedback(card.id, 1)}
                  sx={{
                    color: card.feedback === 1 ? dt.success.main : dt.text.muted,
                    '&:hover': { color: dt.success.main, bgcolor: dt.success.subtle },
                  }}
                >
                  {card.feedback === 1 ? <ThumbUpIcon fontSize="small" /> : <ThumbUpOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
              <Tooltip title="无用" arrow>
                <IconButton
                  size="small"
                  onClick={() => onFeedback(card.id, -1)}
                  sx={{
                    color: card.feedback === -1 ? dt.danger.main : dt.text.muted,
                    '&:hover': { color: dt.danger.main, bgcolor: dt.danger.subtle },
                  }}
                >
                  {card.feedback === -1 ? <ThumbDownIcon fontSize="small" /> : <ThumbDownOutlinedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Box>
            <ExpandMoreIcon
              sx={{
                color: dt.text.muted,
                transition: 'transform 0.3s',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </Box>
        </Box>

        {/* Expanded content */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 2.5, pt: 2, borderTop: `1px solid ${dt.border.default}` }}>
            {/* Full summary */}
            <Typography variant="body2" sx={{ color: dt.text.secondary, lineHeight: 1.7, mb: 2 }}>
              {card.summary}
            </Typography>

            {/* Details */}
            {card.details && (
              <Box sx={{ mb: 2 }}>
                <MarkdownContent content={card.details} />
              </Box>
            )}

            {/* Impact */}
            {card.impact && (
              <Box
                sx={{
                  p: 2,
                  mb: 2,
                  borderRadius: '12px',
                  bgcolor: dt.warning.subtle,
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ color: dt.warning.dark, fontWeight: 700, mb: 0.75, fontSize: '0.8rem' }}
                >
                  影响分析
                </Typography>
                <Typography variant="body2" sx={{ color: dt.text.secondary, lineHeight: 1.7 }}>
                  {renderInlineMarkdown(card.impact)}
                </Typography>
              </Box>
            )}

            {/* Action */}
            {card.action && (
              <Box
                sx={{
                  p: 2,
                  mb: 2,
                  borderRadius: '12px',
                  bgcolor: dt.accent.subtle,
                  border: `1px solid ${dt.accent.border}`,
                }}
              >
                <Typography
                  variant="subtitle2"
                  sx={{ color: dt.accent.dark, fontWeight: 700, mb: 0.75, fontSize: '0.8rem' }}
                >
                  建议行动
                </Typography>
                <Typography variant="body2" sx={{ color: dt.text.secondary, lineHeight: 1.7 }}>
                  {renderInlineMarkdown(card.action)}
                </Typography>
              </Box>
            )}

            {/* Sources */}
            {card.sources && card.sources.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography
                  variant="overline"
                  sx={{ color: dt.text.muted, letterSpacing: '0.1em', fontSize: '0.65rem', mb: 1, display: 'block' }}
                >
                  信息来源
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {card.sources.map((source, i) => (
                    <Box
                      key={i}
                      component="a"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        color: dt.accent.main,
                        textDecoration: 'none',
                        fontSize: '0.82rem',
                        '&:hover': { color: dt.accent.dark, textDecoration: 'underline' },
                      }}
                    >
                      <OpenInNewIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ color: 'inherit' }}>
                        {source.title}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Viewed indicator */}
            {(card.viewedAt || viewedRef.current) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, pt: 1.5, borderTop: `1px solid ${dt.border.subtle}` }}>
                <VisibilityIcon sx={{ fontSize: 14, color: dt.text.muted }} />
                <Typography variant="caption" sx={{ color: dt.text.muted }}>
                  已查看
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function BriefingPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  // ─── Fetch briefing ──────────────────────────────────────
  const loadBriefing = useCallback(async (date: Date) => {
    setLoading(true);
    setError('');
    try {
      const dateStr = formatDateParam(date);
      const res = await fetch(`/api/insights/briefing?date=${dateStr}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        const b = data.briefing as Briefing | null;
        setBriefing(b);
        // If the briefing is in generating status, poll for updates
        if (b && b.status === 'generating') {
          setGenerating(true);
        } else {
          setGenerating(false);
        }
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
    loadBriefing(selectedDate);
  }, [selectedDate, loadBriefing]);

  // Poll when generating
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => {
      loadBriefing(selectedDate);
    }, 5000);
    return () => clearInterval(interval);
  }, [generating, selectedDate, loadBriefing]);

  // ─── Generate briefing ──────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/insights/briefing/generate', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        // Reload to get the updated briefing
        await loadBriefing(selectedDate);
      } else {
        setError(data.error || '生成失败');
        setGenerating(false);
      }
    } catch {
      setError('网络错误');
      setGenerating(false);
    }
  };

  // ─── Date navigation ────────────────────────────────────
  const goDay = (offset: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    setSelectedDate(d);
  };

  const goToday = () => {
    setSelectedDate(new Date());
  };

  // ─── Feedback handler ───────────────────────────────────
  const handleFeedback = async (cardId: string, feedback: number) => {
    try {
      const res = await fetch(`/api/insights/cards/${cardId}/feedback`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const data = await res.json();
      if (data.success && briefing) {
        // Update local state
        setBriefing({
          ...briefing,
          cards: briefing.cards.map((c) =>
            c.id === cardId ? { ...c, feedback: c.feedback === feedback ? null : feedback } : c
          ),
        });
      }
    } catch {
      // Silently fail for feedback
    }
  };

  // ─── Suggested topic handlers ──────────────────────────
  const handleSuggestion = async (id: string, action: 'accept' | 'dismiss') => {
    try {
      const res = await fetch(`/api/insights/topics/suggested/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success && briefing) {
        setBriefing({
          ...briefing,
          suggestedTopics: briefing.suggestedTopics.filter((s) => s.id !== id),
        });
        if (action === 'accept') {
          setSnackbar('已添加话题，AI 正在生成关键字搭配...');
        }
      }
    } catch {
      // Silently fail
    }
  };

  // ─── Render ──────────────────────────────────────────────
  const isGen = generating || (briefing?.status === 'generating');

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ pt: 1, pb: 3 }}>
        <Fade in timeout={600}>
          <Box>
            {/* Title row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <SparkleIcon sx={{ color: dt.accent.main, fontSize: 24 }} />
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  color: dt.text.primary,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                洞察简报
              </Typography>
            </Box>

            {/* Controls row */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              {/* Date navigation */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title="前一天" arrow>
                  <IconButton
                    size="small"
                    onClick={() => goDay(-1)}
                    sx={{
                      color: dt.text.secondary,
                      border: `1px solid ${dt.border.default}`,
                      borderRadius: '10px',
                      '&:hover': { color: dt.accent.main, borderColor: dt.accent.border, bgcolor: dt.accent.subtle },
                    }}
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Typography
                  variant="body1"
                  sx={{ color: dt.text.primary, fontWeight: 600, minWidth: 160, textAlign: 'center' }}
                >
                  {formatDateDisplay(selectedDate)}
                </Typography>

                <Tooltip title="后一天" arrow>
                  <IconButton
                    size="small"
                    onClick={() => goDay(1)}
                    sx={{
                      color: dt.text.secondary,
                      border: `1px solid ${dt.border.default}`,
                      borderRadius: '10px',
                      '&:hover': { color: dt.accent.main, borderColor: dt.accent.border, bgcolor: dt.accent.subtle },
                    }}
                  >
                    <ChevronRightIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                {!isToday(selectedDate) && (
                  <Tooltip title="回到今天" arrow>
                    <IconButton
                      size="small"
                      onClick={goToday}
                      sx={{
                        color: dt.accent.main,
                        border: `1px solid ${dt.accent.border}`,
                        borderRadius: '10px',
                        '&:hover': { bgcolor: dt.accent.subtle },
                      }}
                    >
                      <TodayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {briefing && <StatusBadge status={briefing.status} />}
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<SettingsIcon />}
                  onClick={() => router.push('/insights/topics')}
                  sx={{
                    borderColor: dt.border.strong,
                    color: dt.text.secondary,
                    fontWeight: 600,
                    borderRadius: '10px',
                    '&:hover': {
                      borderColor: dt.accent.main,
                      color: dt.accent.dark,
                      bgcolor: dt.accent.subtle,
                    },
                  }}
                >
                  话题管理
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={isGen ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SparkleIcon />}
                  onClick={handleGenerate}
                  disabled={isGen}
                  sx={{ borderRadius: '10px' }}
                >
                  {isGen ? '生成中...' : '生成简报'}
                </Button>
              </Box>
            </Box>
          </Box>
        </Fade>
      </Box>

      {/* Generating progress bar */}
      {isGen && (
        <Box sx={{ mb: 3 }}>
          <LinearProgress
            sx={{
              height: 3,
              borderRadius: 2,
              bgcolor: 'transparent',
              '& .MuiLinearProgress-bar': {
                background: `linear-gradient(90deg, ${dt.accent.main}, ${dt.purple.main})`,
              },
            }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1.5 }}>
            <CircularProgress size={14} thickness={5} sx={{ color: dt.accent.main }} />
            <Typography variant="body2" sx={{ color: dt.text.muted }}>
              正在研究话题并生成洞察...
            </Typography>
          </Box>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            bgcolor: dt.danger.subtle,
            color: dt.danger.dark,
            border: '1px solid rgba(239, 68, 68, 0.15)',
            '& .MuiAlert-icon': { color: dt.danger.main },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 12, gap: 3 }}>
          <CircularProgress
            size={48}
            thickness={3}
            sx={{
              color: dt.accent.main,
              '& .MuiCircularProgress-circle': { strokeLinecap: 'round' },
            }}
          />
          <Typography variant="body2" sx={{ color: dt.text.muted }}>
            正在加载简报...
          </Typography>
        </Box>
      ) : !briefing ? (
        /* No briefing for this date */
        <Card sx={{ ...CARD_STYLE, '&:hover': { transform: 'none' } }} elevation={0}>
          <CardContent
            sx={{
              py: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <SparkleIcon sx={{ fontSize: 48, color: dt.text.muted, opacity: 0.4 }} />
            <Typography variant="body1" sx={{ color: dt.text.muted }}>
              该日期暂无洞察简报
            </Typography>
            <Button
              variant="contained"
              startIcon={isGen ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SparkleIcon />}
              onClick={handleGenerate}
              disabled={isGen}
            >
              {isGen ? '生成中...' : '生成简报'}
            </Button>
          </CardContent>
        </Card>
      ) : briefing.cards.length === 0 && briefing.status !== 'generating' ? (
        /* Briefing exists but no cards */
        <Card sx={{ ...CARD_STYLE, '&:hover': { transform: 'none' } }} elevation={0}>
          <CardContent
            sx={{
              py: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 48, color: dt.text.muted, opacity: 0.4 }} />
            <Typography variant="body1" sx={{ color: dt.text.muted }}>
              简报生成完毕但未找到有价值的信息
            </Typography>
          </CardContent>
        </Card>
      ) : (
        /* Briefing content */
        <Box>
          {/* Summary section */}
          {briefing.summary && (
            <Fade in timeout={800}>
              <Card sx={{ ...CARD_STYLE, mb: 3, '&:hover': { ...CARD_STYLE['&:hover'], transform: 'none' } }} elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <SparkleIcon sx={{ color: dt.accent.main, fontSize: 18 }} />
                    <Typography variant="subtitle2" sx={{ color: dt.text.primary, fontWeight: 700 }}>
                      概要
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {briefing.summary.split('\n').filter(Boolean).map((line, i) => (
                      <Typography
                        key={i}
                        variant="body2"
                        sx={{ color: dt.text.secondary, lineHeight: 1.7 }}
                      >
                        {renderInlineMarkdown(line)}
                      </Typography>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Fade>
          )}

          {/* Card list */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {briefing.cards.map((card, i) => (
              <Fade in timeout={400 + i * 100} key={card.id}>
                <Box>
                  <BriefingCardItem card={card} onFeedback={handleFeedback} />
                </Box>
              </Fade>
            ))}
          </Box>

          {/* Suggested topics */}
          {briefing.suggestedTopics && briefing.suggestedTopics.length > 0 && (
            <Fade in timeout={800}>
              <Card sx={{ ...CARD_STYLE, mt: 3, '&:hover': { ...CARD_STYLE['&:hover'], transform: 'none' } }} elevation={0}>
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <LightbulbIcon sx={{ color: dt.warning.main, fontSize: 18 }} />
                    <Typography variant="subtitle2" sx={{ color: dt.text.primary, fontWeight: 700 }}>
                      AI 发现了这些值得关注的新话题
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {briefing.suggestedTopics.map((s) => (
                      <Box
                        key={s.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          p: 1.5,
                          borderRadius: '12px',
                          bgcolor: dt.bg.surface,
                          border: `1px solid ${dt.border.default}`,
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ color: dt.text.primary, fontWeight: 600 }}>
                            {s.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: dt.text.secondary, fontSize: '0.82rem' }}>
                            {s.reason}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                          <Tooltip title="采纳话题" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleSuggestion(s.id, 'accept')}
                              sx={{
                                color: dt.success.main,
                                border: `1px solid ${dt.success.main}30`,
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
                                color: dt.text.muted,
                                '&:hover': { bgcolor: dt.danger.subtle, color: dt.danger.main },
                              }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Fade>
          )}
        </Box>
      )}

      {/* Snackbar */}
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
