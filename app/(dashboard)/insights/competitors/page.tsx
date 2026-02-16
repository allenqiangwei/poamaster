'use client';

import { useState, useEffect } from 'react';
import {
  Typography, Box, Card, CardContent, Button, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Alert,
  CircularProgress, Switch, Divider, Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  AccessTime as AccessTimeIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

interface Competitor {
  id: string;
  name: string;
  company: string | null;
  appStoreId: string | null;
  googlePlayId: string | null;
  websiteUrl: string | null;
  monitorUrls: Array<{ url: string; label: string }>;
  rssFeeds: Array<{ url: string; label: string }>;
  keywords: string[];
  enabled: boolean;
  createdAt: string;
  _count: { reviews: number; webChanges: number; news: number; alerts: number };
}

export default function CompetitorManagementPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState('');
  const [lastCollected, setLastCollected] = useState<Record<string, string | null>>({});
  const [nextCollection, setNextCollection] = useState<Record<string, string> | null>(null);
  const [countdown, setCountdown] = useState('');
  const [serviceRunning, setServiceRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', company: '', appStoreId: '', googlePlayId: '',
    websiteUrl: '', monitorUrls: '', rssFeeds: '', keywords: '',
  });

  const load = async () => {
    try {
      const res = await fetch('/api/competitors', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCompetitors(data.competitors);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
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

  useEffect(() => { load(); loadCollectStatus(); }, []);

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

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', company: '', appStoreId: '', googlePlayId: '', websiteUrl: '', monitorUrls: '', rssFeeds: '', keywords: '' });
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
      rssFeeds: (c.rssFeeds || []).map(f => `${f.label}|${f.url}`).join('\n'),
      keywords: (c.keywords || []).join(', '),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const body: any = {
      name: form.name,
      company: form.company || null,
      appStoreId: form.appStoreId || null,
      googlePlayId: form.googlePlayId || null,
      websiteUrl: form.websiteUrl || null,
      monitorUrls: form.monitorUrls.split('\n').filter(Boolean).map(line => {
        const [label, url] = line.split('|');
        return { label: label?.trim() || '', url: url?.trim() || label?.trim() || '' };
      }),
      rssFeeds: form.rssFeeds.split('\n').filter(Boolean).map(line => {
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
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此竞品？所有相关数据将被清除。')) return;
    await fetch(`/api/competitors/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/competitors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled }),
    });
    load();
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1.5, sm: 0 } }}>
        <Box>
          <Typography variant="h5">竞品管理</Typography>
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={collecting ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            onClick={handleCollect}
            variant="contained"
            size="small"
            disabled={collecting}
          >
            {collecting ? '触发中...' : '立即获取'}
          </Button>
          <Button startIcon={<RefreshIcon />} onClick={load} variant="outlined" size="small">刷新</Button>
          <Button startIcon={<AddIcon />} onClick={openCreate} variant="outlined" size="small">添加竞品</Button>
        </Box>
      </Box>

      {collectMsg && (
        <Alert severity={collectMsg.includes('失败') || collectMsg.includes('未') ? 'error' : 'success'} sx={{ mb: 2 }} onClose={() => setCollectMsg('')}>
          {collectMsg}
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {competitors.length === 0 ? (
        <Card><CardContent>
          <Typography color="text.secondary" align="center">
            暂无竞品。点击"添加竞品"开始监控。
          </Typography>
        </CardContent></Card>
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
                    {(c.rssFeeds || []).length > 0 && <Chip label={`RSS x${(c.rssFeeds || []).length}`} size="small" variant="outlined" />}
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
            <TextField label="RSS 源（每行一个, 格式: 名称|URL）" value={form.rssFeeds} onChange={e => setForm({ ...form, rssFeeds: e.target.value })} size="small" multiline rows={3} placeholder="GameLook|https://www.gamelook.com.cn/feed" />
            <TextField label="搜索关键词（逗号分隔）" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} size="small" placeholder="原神, Genshin, miHoYo" />
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
