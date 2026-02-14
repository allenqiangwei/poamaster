'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Switch,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  Grid,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import AppleIcon from '@mui/icons-material/Apple';
import AndroidIcon from '@mui/icons-material/Android';
import { useRouter } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';

interface Game {
  id: string;
  name: string;
  appStoreId: string | null;
  googlePlayId: string | null;
  xKeywords: string[];
  fbKeywords: string[];
  iconUrl: string | null;
  isActive: boolean;
  _count: {
    reviews: number;
    mentions: number;
    alerts: number;
  };
}

interface FormData {
  name: string;
  appStoreId: string;
  googlePlayId: string;
  xKeywords: string;
  fbKeywords: string;
}

const emptyForm: FormData = {
  name: '',
  appStoreId: '',
  googlePlayId: '',
  xKeywords: '',
  fbKeywords: '',
};

export default function GamesManagementPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch('/api/sentiment/games');
      const data = await res.json();
      if (data.success) {
        setGames(data.games);
      }
    } catch {
      showSnackbar('Failed to load games', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleOpenAdd = () => {
    setEditingGame(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (game: Game) => {
    setEditingGame(game);
    setForm({
      name: game.name,
      appStoreId: game.appStoreId || '',
      googlePlayId: game.googlePlayId || '',
      xKeywords: game.xKeywords.join(', '),
      fbKeywords: game.fbKeywords.join(', '),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      appStoreId: form.appStoreId.trim() || null,
      googlePlayId: form.googlePlayId.trim() || null,
      xKeywords: form.xKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      fbKeywords: form.fbKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    };

    try {
      const url = editingGame
        ? `/api/sentiment/games/${editingGame.id}`
        : '/api/sentiment/games';
      const method = editingGame ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        showSnackbar(editingGame ? '游戏已更新' : '游戏已添加', 'success');
        setDialogOpen(false);
        fetchGames();
      } else {
        showSnackbar(data.error || '操作失败', 'error');
      }
    } catch {
      showSnackbar('操作失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (game: Game) => {
    if (!confirm(`确定要删除 "${game.name}" 吗？相关的评论和预警数据也会被删除。`)) return;

    try {
      const res = await fetch(`/api/sentiment/games/${game.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showSnackbar('游戏已删除', 'success');
        fetchGames();
      } else {
        showSnackbar(data.error || '删除失败', 'error');
      }
    } catch {
      showSnackbar('删除失败', 'error');
    }
  };

  const handleToggleActive = async (game: Game) => {
    try {
      const res = await fetch(`/api/sentiment/games/${game.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !game.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        setGames((prev) =>
          prev.map((g) => (g.id === game.id ? { ...g, isActive: !g.isActive } : g))
        );
      }
    } catch {
      showSnackbar('切换状态失败', 'error');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700 }}>
          游戏管理
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
          添加游戏
        </Button>
      </Box>

      {/* Game List */}
      {games.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <SportsEsportsIcon sx={{ fontSize: 64, color: dt.text.muted, mb: 2 }} />
            <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
              还没有监控的游戏
            </Typography>
            <Typography variant="body2" sx={{ color: dt.text.muted, mb: 3 }}>
              点击上方按钮添加你要监控的游戏
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
              添加游戏
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {games.map((game) => (
            <Card key={game.id}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {/* Game icon */}
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(dt.accent.main, 0.08),
                      flexShrink: 0,
                    }}
                  >
                    <SportsEsportsIcon sx={{ color: dt.accent.main, fontSize: 24 }} />
                  </Box>

                  {/* Name + platforms */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        color: dt.text.primary,
                        cursor: 'pointer',
                        '&:hover': { color: dt.accent.main },
                        transition: 'color 0.2s',
                      }}
                      onClick={() => router.push(`/sentiment/games/${game.id}`)}
                    >
                      {game.name}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                      {game.appStoreId && (
                        <Chip
                          icon={<AppleIcon sx={{ fontSize: 14 }} />}
                          label="App Store"
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem' }}
                        />
                      )}
                      {game.googlePlayId && (
                        <Chip
                          icon={<AndroidIcon sx={{ fontSize: 14 }} />}
                          label="Google Play"
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem', borderColor: dt.success.main, color: dt.success.main }}
                        />
                      )}
                    </Stack>
                  </Box>

                  {/* Stats */}
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexShrink: 0 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" sx={{ color: dt.text.primary, lineHeight: 1.2 }}>
                        {game._count.reviews}
                      </Typography>
                      <Typography variant="caption" sx={{ color: dt.text.muted }}>
                        评论
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography
                        variant="h6"
                        sx={{
                          color: game._count.alerts > 0 ? dt.danger.main : dt.text.primary,
                          lineHeight: 1.2,
                        }}
                      >
                        {game._count.alerts}
                      </Typography>
                      <Typography variant="caption" sx={{ color: dt.text.muted }}>
                        预警
                      </Typography>
                    </Box>
                  </Stack>

                  {/* Active toggle */}
                  <Switch
                    checked={game.isActive}
                    onChange={() => handleToggleActive(game)}
                    size="small"
                    color="primary"
                  />

                  {/* Actions */}
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={() => handleOpenEdit(game)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(game)}
                      sx={{ '&:hover': { color: dt.danger.main } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingGame ? '编辑游戏' : '添加游戏'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="游戏名称"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              fullWidth
              placeholder="例如: 原神"
            />
            <TextField
              label="App Store ID"
              value={form.appStoreId}
              onChange={(e) => setForm({ ...form, appStoreId: e.target.value })}
              fullWidth
              placeholder="例如: 1517783697"
              helperText="在 App Store 链接中的数字 ID"
            />
            <TextField
              label="Google Play ID"
              value={form.googlePlayId}
              onChange={(e) => setForm({ ...form, googlePlayId: e.target.value })}
              fullWidth
              placeholder="例如: com.miHoYo.GenshinImpact"
              helperText="Google Play 应用的包名"
            />
            <TextField
              label="X (Twitter) 关键词"
              value={form.xKeywords}
              onChange={(e) => setForm({ ...form, xKeywords: e.target.value })}
              fullWidth
              placeholder="关键词1, 关键词2, 关键词3"
              helperText="用逗号分隔多个关键词"
            />
            <TextField
              label="Facebook 关键词"
              value={form.fbKeywords}
              onChange={(e) => setForm({ ...form, fbKeywords: e.target.value })}
              fullWidth
              placeholder="关键词1, 关键词2, 关键词3"
              helperText="用逗号分隔多个关键词"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            取消
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="standard"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
