'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Snackbar,
  Autocomplete,
  alpha,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Shield as ShieldIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';
import { useResponsive } from '@/hooks/useResponsive';

// ─── Types ───────────────────────────────────────────────────
interface AlertRule {
  id: string;
  keyword: string;
  signalType: string;
  severity: string;
  isSystem: boolean;
  isEnabled: boolean;
}

interface FeishuChat {
  id: string;
  chatId: string;
  chatType: string;
  name: string | null;
  memberCount: number | null;
  blacklistedAt?: string | null;
  whitelistedAt?: string | null;
  _count?: { messages: number };
}

interface SenderWhitelist {
  id: string;
  senderId: string;
  senderName: string;
  reason: string | null;
  createdAt: string;
}

// ─── Constants ───────────────────────────────────────────────
const SIGNAL_TYPES = [
  { value: 'RISK', label: '风险', color: dt.danger.main, bg: dt.danger.subtle },
  { value: 'BLOCKER', label: '阻塞', color: dt.warning.main, bg: dt.warning.subtle },
  { value: 'ESCALATION', label: '升级', color: dt.purple.main, bg: dt.purple.subtle },
] as const;

const SEVERITIES = [
  { value: 'CRITICAL', label: '严重' },
  { value: 'HIGH', label: '高' },
  { value: 'MEDIUM', label: '中' },
  { value: 'LOW', label: '低' },
] as const;

const TAB_MAP: Record<string, number> = {
  rules: 0,
  blacklist: 1,
  notify: 2,
  threshold: 3,
};

function getSignalChip(type: string) {
  const found = SIGNAL_TYPES.find(s => s.value === type);
  if (!found) return <Chip label={type} size="small" />;
  return (
    <Chip
      label={found.label}
      size="small"
      sx={{
        color: found.color,
        bgcolor: found.bg,
        fontWeight: 600,
        border: `1px solid ${alpha(found.color, 0.2)}`,
      }}
    />
  );
}

function getSeverityChip(severity: string) {
  const label = SEVERITIES.find(s => s.value === severity)?.label || severity;
  const colorMap: Record<string, string> = {
    CRITICAL: dt.danger.main,
    HIGH: dt.warning.main,
    MEDIUM: dt.accent.main,
    LOW: dt.text.muted,
  };
  const color = colorMap[severity] || dt.text.muted;
  return (
    <Chip
      label={label}
      size="small"
      variant="outlined"
      sx={{ color, borderColor: alpha(color, 0.4), fontWeight: 600 }}
    />
  );
}

// ─── Inner Page Component (needs useSearchParams) ────────────
function AlertSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useResponsive();

  // Determine initial tab from URL query
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam && TAB_MAP[tabParam] !== undefined ? TAB_MAP[tabParam] : 0;

  const [currentTab, setCurrentTab] = useState(initialTab);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // ── Tab 0: Rules state ──
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [ruleForm, setRuleForm] = useState({ keyword: '', signalType: 'RISK', severity: 'HIGH' });
  const [ruleSaving, setRuleSaving] = useState(false);

  // ── Tab 1: Blacklist/Whitelist state ──
  const [blacklistedChats, setBlacklistedChats] = useState<FeishuChat[]>([]);
  const [whitelistedChats, setWhitelistedChats] = useState<FeishuChat[]>([]);
  const [senderWhitelist, setSenderWhitelist] = useState<SenderWhitelist[]>([]);
  const [allChats, setAllChats] = useState<FeishuChat[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [senderDialogOpen, setSenderDialogOpen] = useState(false);
  const [senderForm, setSenderForm] = useState({ senderId: '', senderName: '', reason: '' });
  const [senderSaving, setSenderSaving] = useState(false);

  // ── Tab 2 & 3: Config state ──
  const [config, setConfig] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  // ─── Load Rules ────────────────────────────────────────────
  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError('');
    try {
      const url = typeFilter
        ? `/api/feishu/alert-rules?type=${typeFilter}`
        : '/api/feishu/alert-rules';
      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setRules(data.rules);
      } else {
        setRulesError(data.error || '加载失败');
      }
    } catch {
      setRulesError('网络错误');
    } finally {
      setRulesLoading(false);
    }
  }, [typeFilter]);

  // ─── Load Blacklist/Whitelist ──────────────────────────────
  const loadLists = useCallback(async () => {
    setListsLoading(true);
    try {
      const [chatRes, senderRes, allChatsRes] = await Promise.all([
        fetch('/api/feishu/alert-whitelist?type=chat', { credentials: 'include' }),
        fetch('/api/feishu/alert-whitelist?type=sender', { credentials: 'include' }),
        fetch('/api/feishu/chats?limit=100', { credentials: 'include' }),
      ]);
      const chatData = await chatRes.json();
      const senderData = await senderRes.json();
      const allChatsData = await allChatsRes.json();

      if (chatData.success) {
        setBlacklistedChats(chatData.blacklisted || []);
        setWhitelistedChats(chatData.whitelisted || []);
      }
      if (senderData.success) {
        setSenderWhitelist(senderData.senders || []);
      }
      if (allChatsData.success) {
        setAllChats(allChatsData.chats || []);
      }
    } catch {
      // ignore
    } finally {
      setListsLoading(false);
    }
  }, []);

  // ─── Load Config ───────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await fetch('/api/feishu/alert-config', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch {
      // ignore
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // ─── Load data on tab change ───────────────────────────────
  useEffect(() => {
    if (currentTab === 0) loadRules();
    else if (currentTab === 1) loadLists();
    else loadConfig();
  }, [currentTab, loadRules, loadLists, loadConfig]);

  // ─── Rule CRUD ─────────────────────────────────────────────
  const openAddRule = () => {
    setEditingRule(null);
    setRuleForm({ keyword: '', signalType: 'RISK', severity: 'HIGH' });
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    setRuleForm({ keyword: rule.keyword, signalType: rule.signalType, severity: rule.severity });
    setRuleDialogOpen(true);
  };

  const saveRule = async () => {
    if (!ruleForm.keyword.trim()) return;
    setRuleSaving(true);
    try {
      const isEdit = !!editingRule;
      const url = isEdit
        ? `/api/feishu/alert-rules/${editingRule!.id}`
        : '/api/feishu/alert-rules';
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      });
      const data = await res.json();
      if (data.success) {
        setRuleDialogOpen(false);
        setSnackbar({ open: true, message: isEdit ? '规则已更新' : '规则已添加', severity: 'success' });
        loadRules();
      } else {
        setSnackbar({ open: true, message: data.error || '操作失败', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '网络错误', severity: 'error' });
    } finally {
      setRuleSaving(false);
    }
  };

  const toggleRule = async (rule: AlertRule) => {
    try {
      const res = await fetch(`/api/feishu/alert-rules/${rule.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !rule.isEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, isEnabled: !r.isEnabled } : r));
      }
    } catch {
      // ignore
    }
  };

  const deleteRule = async (rule: AlertRule) => {
    if (rule.isSystem) return;
    try {
      const res = await fetch(`/api/feishu/alert-rules/${rule.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setRules(prev => prev.filter(r => r.id !== rule.id));
        setSnackbar({ open: true, message: '规则已删除', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.error || '删除失败', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '网络错误', severity: 'error' });
    }
  };

  // ─── Blacklist/Whitelist operations ────────────────────────
  const removeFromBlacklist = async (chat: FeishuChat) => {
    try {
      const res = await fetch('/api/feishu/chats', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: chat.chatId, isBlacklisted: false }),
      });
      const data = await res.json();
      if (data.success) {
        setBlacklistedChats(prev => prev.filter(c => c.chatId !== chat.chatId));
        setSnackbar({ open: true, message: '已移出黑名单', severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: '操作失败', severity: 'error' });
    }
  };

  const addChatWhitelist = async (chat: FeishuChat) => {
    try {
      const res = await fetch('/api/feishu/alert-whitelist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', id: chat.chatId }),
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistedChats(prev => [...prev, { ...chat, whitelistedAt: new Date().toISOString() }]);
        setSnackbar({ open: true, message: '已加入白名单', severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: '操作失败', severity: 'error' });
    }
  };

  const removeChatWhitelist = async (chat: FeishuChat) => {
    try {
      const res = await fetch('/api/feishu/alert-whitelist', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', id: chat.chatId }),
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistedChats(prev => prev.filter(c => c.chatId !== chat.chatId));
        setSnackbar({ open: true, message: '已移出白名单', severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: '操作失败', severity: 'error' });
    }
  };

  const addSenderWhitelist = async () => {
    if (!senderForm.senderId.trim() || !senderForm.senderName.trim()) return;
    setSenderSaving(true);
    try {
      const res = await fetch('/api/feishu/alert-whitelist', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sender',
          id: senderForm.senderId.trim(),
          name: senderForm.senderName.trim(),
          reason: senderForm.reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSenderDialogOpen(false);
        setSenderForm({ senderId: '', senderName: '', reason: '' });
        setSnackbar({ open: true, message: '已加入发送者白名单', severity: 'success' });
        loadLists();
      } else {
        setSnackbar({ open: true, message: data.error || '操作失败', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '网络错误', severity: 'error' });
    } finally {
      setSenderSaving(false);
    }
  };

  const removeSenderWhitelist = async (sender: SenderWhitelist) => {
    try {
      const res = await fetch('/api/feishu/alert-whitelist', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sender', id: sender.senderId }),
      });
      const data = await res.json();
      if (data.success) {
        setSenderWhitelist(prev => prev.filter(s => s.senderId !== sender.senderId));
        setSnackbar({ open: true, message: '已移出发送者白名单', severity: 'success' });
      }
    } catch {
      setSnackbar({ open: true, message: '操作失败', severity: 'error' });
    }
  };

  // ─── Config save ───────────────────────────────────────────
  const saveConfig = async (fields: Record<string, string>) => {
    setConfigSaving(true);
    try {
      const res = await fetch('/api/feishu/alert-config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(prev => {
          const updated = { ...prev };
          for (const [field, value] of Object.entries(fields)) {
            const keyMap: Record<string, string> = {
              minNotifySeverity: 'alert.minNotifySeverity',
              silentStart: 'alert.silentStart',
              silentEnd: 'alert.silentEnd',
              cooldownMinutes: 'alert.cooldownMinutes',
              batchIntervalMinutes: 'alert.batchIntervalMinutes',
            };
            if (keyMap[field]) updated[keyMap[field]] = value;
          }
          return updated;
        });
        setSnackbar({ open: true, message: '配置已保存', severity: 'success' });
      } else {
        setSnackbar({ open: true, message: data.error || '保存失败', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: '网络错误', severity: 'error' });
    } finally {
      setConfigSaving(false);
    }
  };

  // Available chats for whitelist (exclude already whitelisted)
  const availableChatsForWhitelist = allChats.filter(
    c => !whitelistedChats.some(w => w.chatId === c.chatId)
  );

  // ─── Render: Tab 0 — Rules ────────────────────────────────
  const renderRulesTab = () => (
    <Box>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FilterIcon sx={{ color: dt.text.muted, fontSize: 20 }} />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              displayEmpty
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="">全部类型</MenuItem>
              {SIGNAL_TYPES.map(t => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Chip label={`${rules.length} 条规则`} size="small" variant="outlined" />
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddRule}
          size={isMobile ? 'small' : 'medium'}
        >
          添加规则
        </Button>
      </Box>

      {rulesError && <Alert severity="error" sx={{ mb: 2 }}>{rulesError}</Alert>}

      {rulesLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : rules.length === 0 ? (
        <Alert severity="info">暂无规则</Alert>
      ) : (
        <TableContainer>
          <Table size={isMobile ? 'small' : 'medium'}>
            <TableHead>
              <TableRow>
                <TableCell>关键词</TableCell>
                {!isMobile && <TableCell>信号类型</TableCell>}
                <TableCell>严重程度</TableCell>
                <TableCell align="center">状态</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map(rule => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500, color: dt.text.primary }}>
                        {rule.keyword}
                      </Typography>
                      {rule.isSystem && (
                        <Chip
                          icon={<ShieldIcon sx={{ fontSize: '14px !important' }} />}
                          label="系统"
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            bgcolor: alpha(dt.accent.main, 0.08),
                            color: dt.accent.dark,
                            border: `1px solid ${alpha(dt.accent.main, 0.2)}`,
                          }}
                        />
                      )}
                      {isMobile && (
                        <Box sx={{ ml: 'auto' }}>{getSignalChip(rule.signalType)}</Box>
                      )}
                    </Box>
                  </TableCell>
                  {!isMobile && <TableCell>{getSignalChip(rule.signalType)}</TableCell>}
                  <TableCell>{getSeverityChip(rule.severity)}</TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={rule.isEnabled}
                      onChange={() => toggleRule(rule)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <IconButton size="small" onClick={() => openEditRule(rule)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      {!rule.isSystem && (
                        <IconButton
                          size="small"
                          onClick={() => deleteRule(rule)}
                          sx={{ color: dt.danger.main }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  // ─── Render: Tab 1 — Blacklist/Whitelist ───────────────────
  const renderListsTab = () => (
    <Box>
      {listsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Chat Blacklist */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1">对话黑名单</Typography>
                <Chip label={blacklistedChats.length} size="small" color="error" variant="outlined" />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {blacklistedChats.length === 0 ? (
                <Box sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.secondary">暂无黑名单对话</Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {blacklistedChats.map((chat, i) => (
                    <ListItem key={chat.chatId} divider={i < blacklistedChats.length - 1}>
                      <ListItemText
                        primary={chat.name || chat.chatId}
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                            <Chip
                              label={chat.chatType === 'group' ? '群聊' : '私聊'}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                            {chat._count && (
                              <Chip
                                label={`${chat._count.messages} 条消息`}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                            {chat.blacklistedAt && (
                              <Typography variant="caption" color="text.secondary">
                                拉黑于: {new Date(chat.blacklistedAt).toLocaleString('zh-CN')}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => removeFromBlacklist(chat)}
                        >
                          移除
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Chat Whitelist */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1">对话白名单</Typography>
                <Chip label={whitelistedChats.length} size="small" color="success" variant="outlined" />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ p: 2, pb: 1 }}>
                <Autocomplete
                  options={availableChatsForWhitelist}
                  getOptionLabel={(option) => option.name || option.chatId}
                  onChange={(_e, value) => { if (value) addChatWhitelist(value); }}
                  renderInput={(params) => (
                    <TextField {...params} size="small" placeholder="搜索并添加对话到白名单..." />
                  )}
                  value={null}
                  blurOnSelect
                  clearOnBlur
                />
              </Box>
              {whitelistedChats.length === 0 ? (
                <Box sx={{ p: 2, pt: 0 }}>
                  <Typography variant="body2" color="text.secondary">暂无白名单对话</Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {whitelistedChats.map((chat, i) => (
                    <ListItem key={chat.chatId} divider={i < whitelistedChats.length - 1}>
                      <ListItemText
                        primary={chat.name || chat.chatId}
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                            <Chip
                              label={chat.chatType === 'group' ? '群聊' : '私聊'}
                              size="small"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                            {chat.whitelistedAt && (
                              <Typography variant="caption" color="text.secondary">
                                添加于: {new Date(chat.whitelistedAt).toLocaleString('zh-CN')}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => removeChatWhitelist(chat)}
                        >
                          移除
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Sender Whitelist */}
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle1">发送者白名单</Typography>
                <Chip label={senderWhitelist.length} size="small" color="success" variant="outlined" />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ p: 2, pb: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setSenderForm({ senderId: '', senderName: '', reason: '' });
                    setSenderDialogOpen(true);
                  }}
                >
                  添加发送者
                </Button>
              </Box>
              {senderWhitelist.length === 0 ? (
                <Box sx={{ p: 2, pt: 0 }}>
                  <Typography variant="body2" color="text.secondary">暂无发送者白名单</Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {senderWhitelist.map((sender, i) => (
                    <ListItem key={sender.senderId} divider={i < senderWhitelist.length - 1}>
                      <ListItemText
                        primary={sender.senderName}
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              ID: {sender.senderId}
                            </Typography>
                            {sender.reason && (
                              <Typography variant="caption" color="text.secondary">
                                | {sender.reason}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => removeSenderWhitelist(sender)}
                        >
                          移除
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );

  // ─── Render: Tab 2 — Notify Settings ───────────────────────
  const renderNotifyTab = () => {
    if (configLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    const minSeverity = config['alert.minNotifySeverity'] || 'HIGH';
    const targetChat = config['alert.notifyTargetChat'] || '';
    const silentStart = config['alert.silentStart'] || '22:00';
    const silentEnd = config['alert.silentEnd'] || '08:00';

    return (
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: dt.text.primary }}>
            通知设置
          </Typography>

          <FormControl fullWidth size="small">
            <InputLabel>最低通知严重程度</InputLabel>
            <Select
              value={minSeverity}
              label="最低通知严重程度"
              onChange={(e) => saveConfig({ minNotifySeverity: e.target.value })}
            >
              {SEVERITIES.map(s => (
                <MenuItem key={s.value} value={s.value}>{s.label} ({s.value})</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            size="small"
            label="通知目标群"
            value={targetChat}
            disabled
            helperText="来自系统配置 feishu.chatId，不可在此修改"
          />

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="静默开始时间"
              value={silentStart}
              onChange={(e) => setConfig(prev => ({ ...prev, 'alert.silentStart': e.target.value }))}
              placeholder="HH:mm"
              sx={{ flex: 1, minWidth: 140 }}
            />
            <TextField
              size="small"
              label="静默结束时间"
              value={silentEnd}
              onChange={(e) => setConfig(prev => ({ ...prev, 'alert.silentEnd': e.target.value }))}
              placeholder="HH:mm"
              sx={{ flex: 1, minWidth: 140 }}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => saveConfig({
                silentStart: config['alert.silentStart'] || '22:00',
                silentEnd: config['alert.silentEnd'] || '08:00',
              })}
              disabled={configSaving}
            >
              {configSaving ? '保存中...' : '保存静默时间'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // ─── Render: Tab 3 — Threshold Settings ────────────────────
  const renderThresholdTab = () => {
    if (configLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    const cooldown = config['alert.cooldownMinutes'] || '30';
    const batchInterval = config['alert.batchIntervalMinutes'] || '5';

    return (
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: dt.text.primary }}>
            阈值设置
          </Typography>

          <TextField
            fullWidth
            size="small"
            label="冷却时间（分钟）"
            type="number"
            value={cooldown}
            onChange={(e) => setConfig(prev => ({ ...prev, 'alert.cooldownMinutes': e.target.value }))}
            helperText="同一关键词重复触发的最小间隔时间"
            slotProps={{ htmlInput: { min: 1, max: 1440 } }}
          />

          <TextField
            fullWidth
            size="small"
            label="批量聚合间隔（分钟）"
            type="number"
            value={batchInterval}
            onChange={(e) => setConfig(prev => ({ ...prev, 'alert.batchIntervalMinutes': e.target.value }))}
            helperText="多条告警合并发送的时间窗口"
            slotProps={{ htmlInput: { min: 1, max: 60 } }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => saveConfig({
                cooldownMinutes: config['alert.cooldownMinutes'] || '30',
                batchIntervalMinutes: config['alert.batchIntervalMinutes'] || '5',
              })}
              disabled={configSaving}
            >
              {configSaving ? '保存中...' : '保存阈值设置'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // ─── Main Render ───────────────────────────────────────────
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push('/feishu/chats')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">告警设置</Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={currentTab}
          onChange={(_e, v) => setCurrentTab(v)}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons={isMobile ? 'auto' : false}
        >
          <Tab label="关键词规则" />
          <Tab label="黑白名单" />
          <Tab label="通知设置" />
          <Tab label="阈值设置" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {currentTab === 0 && renderRulesTab()}
      {currentTab === 1 && renderListsTab()}
      {currentTab === 2 && renderNotifyTab()}
      {currentTab === 3 && renderThresholdTab()}

      {/* ── Rule Add/Edit Dialog ── */}
      <Dialog
        open={ruleDialogOpen}
        onClose={() => setRuleDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingRule ? '编辑规则' : '添加规则'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            autoFocus
            fullWidth
            label="关键词"
            value={ruleForm.keyword}
            onChange={(e) => setRuleForm(prev => ({ ...prev, keyword: e.target.value }))}
            placeholder="输入需要匹配的关键词"
          />
          <FormControl fullWidth size="small">
            <InputLabel>信号类型</InputLabel>
            <Select
              value={ruleForm.signalType}
              label="信号类型"
              onChange={(e) => setRuleForm(prev => ({ ...prev, signalType: e.target.value }))}
            >
              {SIGNAL_TYPES.map(t => (
                <MenuItem key={t.value} value={t.value}>{t.label} ({t.value})</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>严重程度</InputLabel>
            <Select
              value={ruleForm.severity}
              label="严重程度"
              onChange={(e) => setRuleForm(prev => ({ ...prev, severity: e.target.value }))}
            >
              {SEVERITIES.map(s => (
                <MenuItem key={s.value} value={s.value}>{s.label} ({s.value})</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRuleDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={saveRule}
            disabled={ruleSaving || !ruleForm.keyword.trim()}
          >
            {ruleSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Sender Whitelist Dialog ── */}
      <Dialog
        open={senderDialogOpen}
        onClose={() => setSenderDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>添加发送者白名单</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            autoFocus
            fullWidth
            label="发送者 ID"
            value={senderForm.senderId}
            onChange={(e) => setSenderForm(prev => ({ ...prev, senderId: e.target.value }))}
            placeholder="Feishu 用户 ID"
          />
          <TextField
            fullWidth
            label="发送者姓名"
            value={senderForm.senderName}
            onChange={(e) => setSenderForm(prev => ({ ...prev, senderName: e.target.value }))}
          />
          <TextField
            fullWidth
            label="原因（可选）"
            value={senderForm.reason}
            onChange={(e) => setSenderForm(prev => ({ ...prev, reason: e.target.value }))}
            placeholder="为什么加入白名单"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSenderDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={addSenderWhitelist}
            disabled={senderSaving || !senderForm.senderId.trim() || !senderForm.senderName.trim()}
          >
            {senderSaving ? '添加中...' : '添加'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Exported Page with Suspense Boundary ────────────────────
export default function FeishuAlertSettingsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      }
    >
      <AlertSettingsContent />
    </Suspense>
  );
}
