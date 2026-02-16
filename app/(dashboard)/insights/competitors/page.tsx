'use client';

import { useState, useEffect } from 'react';
import {
  Typography, Box, Card, CardContent, CardActionArea, Button, TextField,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Alert,
  CircularProgress, Switch, Divider, Grid, Tabs, Tab, Menu, MenuItem, Badge,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  AccessTime as AccessTimeIcon,
  Sync as SyncIcon,
  Groups as GroupsIcon,
  RateReview as RateReviewIcon,
  Star as StarIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  MoreVert as MoreVertIcon,
  Check as CheckIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────

interface Competitor {
  id: string;
  name: string;
  company: string | null;
  appStoreId: string | null;
  googlePlayId: string | null;
  websiteUrl: string | null;
  monitorUrls: Array<{ url: string; label: string }>;
  keywords: string[];
  enabled: boolean;
  createdAt: string;
  _count: { reviews: number; webChanges: number; news: number; alerts: number };
}

interface KPI {
  competitorCount: number;
  thisWeekReviews: number;
  reviewChange: number;
  avgRating: number | null;
  unacknowledgedAlerts: number;
}

interface CardData {
  id: string;
  name: string;
  company: string | null;
  platforms: string[];
  currentRating: number | null;
  ratingTrend: number | null;
  reviewCount: number;
  positiveRatio: number | null;
  unreadAlerts: number;
}

interface AlertItem {
  id: string;
  severity: string;
  title: string;
  competitorName: string;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────

const COLORS = [
  dt.accent.main, dt.teal.main, dt.purple.main, '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6',
];

const kpiCards = [
  { key: 'competitorCount' as const, label: '监控竞品数', icon: GroupsIcon, color: dt.accent.main, subtle: dt.accent.subtle },
  { key: 'thisWeekReviews' as const, label: '本周评论', icon: RateReviewIcon, color: dt.teal.main, subtle: dt.teal.subtle, showChange: true },
  { key: 'avgRating' as const, label: '平均评分', icon: StarIcon, color: dt.purple.main, subtle: dt.purple.subtle, isFloat: true },
  { key: 'unacknowledgedAlerts' as const, label: '待处理告警', icon: WarningIcon, color: dt.danger.main, subtle: dt.danger.subtle, dynamicColor: true },
];

// ─── Component ───────────────────────────────────────────────

export default function CompetitorDashboardPage() {
  const router = useRouter();

  // Tab state: 0=overview, 1=compare, 2=news, 3=manage
  const [activeTab, setActiveTab] = useState(0);

  // Dashboard data
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [cardData, setCardData] = useState<CardData[]>([]);
  const [ratingTrend, setRatingTrend] = useState<Record<string, any>[]>([]);
  const [competitorNames, setCompetitorNames] = useState<string[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Service status
  const [lastCollected, setLastCollected] = useState<Record<string, string | null>>({});
  const [nextCollection, setNextCollection] = useState<Record<string, string> | null>(null);
  const [countdown, setCountdown] = useState('');
  const [serviceRunning, setServiceRunning] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');

  // CRUD state (manage tab)
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [crudLoading, setCrudLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', company: '', appStoreId: '', googlePlayId: '',
    websiteUrl: '', monitorUrls: '', keywords: '',
  });

  // Card menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuCardId, setMenuCardId] = useState<string | null>(null);

  // ─── Data Fetching ─────────────────────────────────────────

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/competitors/dashboard', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setKpi(data.kpi);
        setCardData(data.cardData);
        setRatingTrend(data.ratingTrend);
        setCompetitorNames(data.competitorNames);
        setRecentAlerts(data.recentAlerts);
      }
    } catch {
      /* silently fail */
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadCollectStatus = async () => {
    try {
      const res = await fetch('/api/competitors/collect', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setLastCollected(data.lastCollected);
        setNextCollection(data.nextCollection);
        setServiceRunning(data.serviceRunning);
      }
    } catch { /* ignore */ }
  };

  const loadCompetitors = async () => {
    setCrudLoading(true);
    try {
      const res = await fetch('/api/competitors', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCompetitors(data.competitors);
    } catch {
      setError('加载失败');
    } finally {
      setCrudLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    loadCollectStatus();
  }, []);

  // Load CRUD data when switching to manage tab
  useEffect(() => {
    if (activeTab === 3 && competitors.length === 0) {
      loadCompetitors();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live countdown to nearest next collection
  useEffect(() => {
    if (!nextCollection) return;
    const tick = () => {
      const times = Object.values(nextCollection).map(iso => new Date(iso).getTime());
      const nearest = Math.min(...times);
      const diff = nearest - Date.now();
      if (diff <= 0) { setCountdown('即将采集'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setCountdown(h > 0 ? `${h}小时${m}分钟` : `${m}分钟`);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [nextCollection]);

  // ─── Service Actions ───────────────────────────────────────

  const handleCollect = async () => {
    setCollecting(true);
    setCollectMsg('');
    try {
      const res = await fetch('/api/competitors/collect', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      setCollectMsg(data.success ? '已触发采集，数据将在几分钟内更新' : (data.error || '触发失败'));
    } catch {
      setCollectMsg('请求失败，请确认竞品监控服务已启动');
    } finally {
      setCollecting(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const res = await fetch('/api/competitors/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: alertId }),
      });
      const data = await res.json();
      if (data.success) {
        setRecentAlerts(prev => prev.filter(a => a.id !== alertId));
        if (kpi) {
          setKpi({ ...kpi, unacknowledgedAlerts: Math.max(0, kpi.unacknowledgedAlerts - 1) });
        }
      }
    } catch { /* ignore */ }
  };

  // ─── CRUD Handlers ─────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', company: '', appStoreId: '', googlePlayId: '', websiteUrl: '', monitorUrls: '', keywords: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: Competitor) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      company: c.company || '',
      appStoreId: c.appStoreId || '',
      googlePlayId: c.googlePlayId || '',
      websiteUrl: c.websiteUrl || '',
      monitorUrls: (c.monitorUrls || []).map(u => `${u.label}|${u.url}`).join('\n'),
      keywords: (c.keywords || []).join(', '),
    });
    setDialogOpen(true);
  };

  const openEditFromCard = (cardId: string) => {
    setMenuAnchor(null);
    setMenuCardId(null);
    // Fetch full competitor data for editing
    const fetchAndEdit = async () => {
      try {
        const res = await fetch('/api/competitors', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          const found = data.competitors.find((c: Competitor) => c.id === cardId);
          if (found) openEdit(found);
        }
      } catch { /* ignore */ }
    };
    fetchAndEdit();
  };

  const handleSave = async () => {
    const body: Record<string, unknown> = {
      name: form.name,
      company: form.company || null,
      appStoreId: form.appStoreId || null,
      googlePlayId: form.googlePlayId || null,
      websiteUrl: form.websiteUrl || null,
      monitorUrls: form.monitorUrls.split('\n').filter(Boolean).map(line => {
        const [label, url] = line.split('|');
        return { label: label?.trim() || '', url: url?.trim() || label?.trim() || '' };
      }),
      keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
    };

    const url = editingId ? `/api/competitors/${editingId}` : '/api/competitors';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setDialogOpen(false);
      loadCompetitors();
      loadDashboard();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此竞品？所有相关数据将被清除。')) return;
    await fetch(`/api/competitors/${id}`, { method: 'DELETE', credentials: 'include' });
    loadCompetitors();
    loadDashboard();
  };

  const handleDeleteFromCard = (cardId: string) => {
    setMenuAnchor(null);
    setMenuCardId(null);
    handleDelete(cardId);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/competitors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled }),
    });
    loadCompetitors();
    loadDashboard();
  };

  const handleToggleFromCard = (cardId: string) => {
    setMenuAnchor(null);
    setMenuCardId(null);
    // Find current state
    const card = cardData.find(c => c.id === cardId);
    if (!card) return;
    // Toggle — we don't know enabled state from cardData so we fetch
    const doToggle = async () => {
      try {
        const res = await fetch('/api/competitors', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          const found = data.competitors.find((c: Competitor) => c.id === cardId);
          if (found) handleToggle(cardId, !found.enabled);
        }
      } catch { /* ignore */ }
    };
    doToggle();
  };

  // ─── Tab Navigation ────────────────────────────────────────

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    if (newValue === 1) {
      router.push('/insights/competitors/compare');
      return;
    }
    if (newValue === 2) {
      router.push('/insights/competitors/news');
      return;
    }
    setActiveTab(newValue);
  };

  // ─── Helpers ───────────────────────────────────────────────

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  // ─── Loading State ─────────────────────────────────────────

  if (dashboardLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  // ─── Render ────────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        mb: 2,
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1.5, sm: 0 },
      }}>
        <Box>
          <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700 }}>
            竞品监控
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
            {(() => {
              const parts = [
                lastCollected.reviews && `评论 ${new Date(lastCollected.reviews).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
                lastCollected.webChanges && `网页 ${new Date(lastCollected.webChanges).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
                lastCollected.news && `新闻 ${new Date(lastCollected.news).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
              ].filter(Boolean);
              if (parts.length === 0) return null;
              return (
                <Typography variant="caption" sx={{ color: dt.text.muted }}>
                  <AccessTimeIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.25 }} />
                  上次采集: {parts.join(' · ')}
                </Typography>
              );
            })()}
            {countdown && (
              <Typography variant="caption" sx={{ color: dt.accent.main, fontWeight: 600 }}>
                下次: {countdown}
              </Typography>
            )}
            {!serviceRunning && (
              <Chip label="服务未运行" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Button
            startIcon={collecting ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            onClick={handleCollect}
            variant="contained"
            size="small"
            disabled={collecting}
          >
            {collecting ? '触发中...' : '立即获取'}
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            onClick={() => { loadDashboard(); loadCollectStatus(); }}
            variant="outlined"
            size="small"
          >
            刷新
          </Button>
        </Box>
      </Box>

      {collectMsg && (
        <Alert
          severity={collectMsg.includes('失败') || collectMsg.includes('未') ? 'error' : 'success'}
          sx={{ mb: 2 }}
          onClose={() => setCollectMsg('')}
        >
          {collectMsg}
        </Alert>
      )}

      {/* Tab Navigation */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{ mb: 3, borderBottom: `1px solid ${dt.border.default}` }}
      >
        <Tab label="总览" />
        <Tab label="对比" />
        <Tab label="新闻" />
        <Tab label="管理" />
      </Tabs>

      {/* ═══ Overview Tab ═══ */}
      {activeTab === 0 && (
        <>
          {/* KPI Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {kpiCards.map((sc) => {
              const rawValue = kpi?.[sc.key] ?? 0;
              const value = sc.isFloat && typeof rawValue === 'number'
                ? rawValue.toFixed(1)
                : rawValue;
              const cardColor = sc.dynamicColor && rawValue === 0 ? dt.success.main : sc.color;
              const cardSubtle = sc.dynamicColor && rawValue === 0 ? dt.success.subtle : sc.subtle;
              const Icon = sc.icon;
              return (
                <Grid key={sc.key} size={{ xs: 6, md: 3 }}>
                  <Card>
                    <CardContent sx={{ py: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{
                        width: 48, height: 48, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: cardSubtle, flexShrink: 0,
                      }}>
                        <Icon sx={{ color: cardColor, fontSize: 24 }} />
                      </Box>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                          <Typography variant="h5" sx={{ color: dt.text.primary, fontWeight: 700, lineHeight: 1.2 }}>
                            {value}
                          </Typography>
                          {sc.showChange && kpi && kpi.reviewChange !== 0 && (
                            <Chip
                              size="small"
                              icon={kpi.reviewChange > 0
                                ? <ArrowUpwardIcon sx={{ fontSize: '14px !important' }} />
                                : <ArrowDownwardIcon sx={{ fontSize: '14px !important' }} />
                              }
                              label={`${kpi.reviewChange > 0 ? '+' : ''}${kpi.reviewChange}`}
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                bgcolor: kpi.reviewChange > 0 ? dt.success.subtle : dt.danger.subtle,
                                color: kpi.reviewChange > 0 ? dt.success.dark : dt.danger.dark,
                                '& .MuiChip-icon': {
                                  color: kpi.reviewChange > 0 ? dt.success.dark : dt.danger.dark,
                                },
                              }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ color: dt.text.muted }}>{sc.label}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          {/* Rating Trend Chart */}
          {ratingTrend.length > 0 && competitorNames.length > 0 && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  评分趋势（30天）
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={ratingTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                    />
                    <YAxis
                      domain={[1, 5]}
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                      allowDecimals
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dt.bg.elevated,
                        border: `1px solid ${dt.border.default}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      labelFormatter={(label) => `日期: ${label}`}
                    />
                    <Legend />
                    {competitorNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Competitor Cards Grid */}
          {cardData.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <GroupsIcon sx={{ fontSize: 64, color: dt.text.muted, mb: 2 }} />
                <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
                  还没有监控的竞品
                </Typography>
                <Typography variant="body2" sx={{ color: dt.text.muted, mb: 3 }}>
                  切换到"管理"标签页添加竞品开始监控
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setActiveTab(3)}>
                  添加竞品
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {cardData.map((c) => (
                <Grid key={c.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Card sx={{ height: '100%', position: 'relative' }}>
                    {/* 3-dot menu button */}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAnchor(e.currentTarget);
                        setMenuCardId(c.id);
                      }}
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 2,
                        color: dt.text.muted,
                        '&:hover': { color: dt.text.secondary },
                      }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>

                    <CardActionArea
                      onClick={() => router.push(`/insights/competitors/${c.id}`)}
                      sx={{ height: '100%' }}
                    >
                      <CardContent sx={{ py: 2.5 }}>
                        {/* Name + Company */}
                        <Box sx={{ mb: 2, pr: 3 }}>
                          <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600 }}>
                            {c.name}
                          </Typography>
                          {c.company && (
                            <Typography variant="caption" sx={{ color: dt.text.muted }}>
                              {c.company}
                            </Typography>
                          )}
                        </Box>

                        {/* Rating + Trend */}
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.5 }}>
                          {c.currentRating !== null ? (
                            <>
                              <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700, lineHeight: 1 }}>
                                {c.currentRating.toFixed(1)}
                              </Typography>
                              <StarIcon sx={{ fontSize: 20, color: dt.warning.main, alignSelf: 'center' }} />
                              {c.ratingTrend !== null && c.ratingTrend !== 0 && (
                                <Box sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: c.ratingTrend > 0 ? dt.success.main : dt.danger.main,
                                }}>
                                  {c.ratingTrend > 0
                                    ? <TrendingUpIcon sx={{ fontSize: 18 }} />
                                    : <TrendingDownIcon sx={{ fontSize: 18 }} />
                                  }
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {c.ratingTrend > 0 ? '+' : ''}{c.ratingTrend.toFixed(2)}
                                  </Typography>
                                </Box>
                              )}
                            </>
                          ) : (
                            <Typography variant="body2" sx={{ color: dt.text.muted }}>暂无评分</Typography>
                          )}
                        </Box>

                        {/* Review count + Positive ratio */}
                        <Box sx={{ display: 'flex', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ color: dt.text.secondary }}>
                            {c.reviewCount} 条本周评论
                          </Typography>
                          {c.positiveRatio !== null && (
                            <Typography variant="body2" sx={{ color: dt.success.main, fontWeight: 600 }}>
                              {c.positiveRatio}% 好评
                            </Typography>
                          )}
                        </Box>

                        {/* Platform Chips */}
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                          {c.platforms.map((p) => (
                            <Chip
                              key={p}
                              label={p}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 22,
                                fontSize: '0.7rem',
                                borderColor: p === 'App Store'
                                  ? alpha(dt.accent.main, 0.4)
                                  : alpha(dt.success.main, 0.4),
                                color: p === 'App Store' ? dt.accent.dark : dt.success.dark,
                              }}
                            />
                          ))}
                        </Box>

                        {/* Alert Badge */}
                        {c.unreadAlerts > 0 && (
                          <Chip
                            icon={<WarningIcon sx={{ fontSize: 14 }} />}
                            label={`${c.unreadAlerts} 条未处理告警`}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              bgcolor: dt.danger.subtle,
                              color: dt.danger.dark,
                              border: 'none',
                              '& .MuiChip-icon': { color: dt.danger.main },
                            }}
                          />
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Card Context Menu */}
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => { setMenuAnchor(null); setMenuCardId(null); }}
          >
            <MenuItem onClick={() => menuCardId && openEditFromCard(menuCardId)}>
              <EditIcon fontSize="small" sx={{ mr: 1 }} /> 编辑
            </MenuItem>
            <MenuItem onClick={() => menuCardId && handleToggleFromCard(menuCardId)}>
              <SyncIcon fontSize="small" sx={{ mr: 1 }} /> 启用/禁用
            </MenuItem>
            <MenuItem
              onClick={() => menuCardId && handleDeleteFromCard(menuCardId)}
              sx={{ color: dt.danger.main }}
            >
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> 删除
            </MenuItem>
          </Menu>

          {/* Recent Alerts Panel */}
          {recentAlerts.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  最新告警
                </Typography>
                {recentAlerts.map((alert, idx) => (
                  <Box key={alert.id}>
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      py: 1.5,
                    }}>
                      <Chip
                        label={alert.severity}
                        size="small"
                        sx={{
                          height: 24,
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          minWidth: 56,
                          bgcolor: alert.severity === 'HIGH'
                            ? dt.danger.subtle
                            : alert.severity === 'MEDIUM'
                              ? dt.warning.subtle
                              : alpha(dt.text.muted, 0.08),
                          color: alert.severity === 'HIGH'
                            ? dt.danger.dark
                            : alert.severity === 'MEDIUM'
                              ? dt.warning.dark
                              : dt.text.secondary,
                        }}
                      />
                      <Typography variant="body2" sx={{ flex: 1, color: dt.text.primary }}>
                        {alert.title}
                      </Typography>
                      <Chip
                        label={alert.competitorName}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.65rem', borderColor: dt.border.default }}
                      />
                      <Typography variant="caption" sx={{ color: dt.text.muted, flexShrink: 0 }}>
                        {formatRelativeTime(alert.createdAt)}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => acknowledgeAlert(alert.id)}
                        sx={{ color: dt.success.main, '&:hover': { bgcolor: dt.success.subtle } }}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {idx < recentAlerts.length - 1 && <Divider />}
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══ Manage Tab ═══ */}
      {activeTab === 3 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button startIcon={<AddIcon />} onClick={openCreate} variant="contained" size="small">
              添加竞品
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {crudLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : competitors.length === 0 ? (
            <Card>
              <CardContent>
                <Typography color="text.secondary" align="center">
                  暂无竞品。点击"添加竞品"开始监控。
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Grid container spacing={2}>
              {competitors.map(c => (
                <Grid key={c.id} size={{ xs: 12, md: 6 }}>
                  <Card sx={{ opacity: c.enabled ? 1 : 0.6 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="h6">{c.name}</Typography>
                        <Box>
                          <Switch checked={c.enabled} size="small" onChange={(_, v) => handleToggle(c.id, v)} />
                          <IconButton size="small" onClick={() => openEdit(c)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" onClick={() => handleDelete(c.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                      </Box>
                      {c.company && <Typography variant="body2" color="text.secondary">{c.company}</Typography>}
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {c.appStoreId && <Chip label="App Store" size="small" color="primary" variant="outlined" />}
                        {c.googlePlayId && <Chip label="Google Play" size="small" color="success" variant="outlined" />}
                        {c.websiteUrl && <Chip label="官网" size="small" color="info" variant="outlined" />}
                        {(c.keywords || []).length > 0 && <Chip label={`关键词 x${(c.keywords || []).length}`} size="small" color="secondary" variant="outlined" />}
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Typography variant="caption" color="text.secondary">{c._count.reviews} 评论</Typography>
                        <Typography variant="caption" color="text.secondary">{c._count.webChanges} 网页变化</Typography>
                        <Typography variant="caption" color="text.secondary">{c._count.news} 新闻</Typography>
                        {c._count.alerts > 0 && <Chip label={`${c._count.alerts} 未处理告警`} size="small" color="warning" />}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* ═══ Add/Edit Dialog ═══ */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑竞品' : '添加竞品'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="名称 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} size="small" />
            <TextField label="公司" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} size="small" />
            <TextField label="App Store ID" value={form.appStoreId} onChange={e => setForm({ ...form, appStoreId: e.target.value })} size="small" placeholder="如: 1517783697" />
            <TextField label="Google Play ID" value={form.googlePlayId} onChange={e => setForm({ ...form, googlePlayId: e.target.value })} size="small" placeholder="如: com.example.game" />
            <TextField label="官网 URL" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} size="small" placeholder="https://..." />
            <TextField label="额外监控 URL（每行一个, 格式: 标签|URL）" value={form.monitorUrls} onChange={e => setForm({ ...form, monitorUrls: e.target.value })} size="small" multiline rows={3} placeholder="公告页|https://example.com/news" />
            <TextField label="搜索关键词 *（逗号分隔，用于网页搜索）" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} size="small" placeholder="原神, Genshin, miHoYo" helperText="系统将通过 Google 搜索这些关键词来获取竞品新闻" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={handleSave} variant="contained" disabled={!form.name.trim()}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
