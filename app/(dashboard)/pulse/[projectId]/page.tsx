'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Collapse,
  Alert,
  Snackbar,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import UploadIcon from '@mui/icons-material/Upload';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { EntryDimension } from '@prisma/client';
import { DIMENSION_LABELS, DIMENSION_ORDER, UNDO_WINDOW_MS } from '@/lib/pulse/constants';

interface Entry {
  id: string;
  dimension: EntryDimension;
  title: string;
  evidenceCurrent: string;
  sourceCurrent: {
    reportType: string;
    reportDate: string;
    fileName: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  entries: Entry[];
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dimensionFilter, setDimensionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Collapsible sections
  const [expandedDimensions, setExpandedDimensions] = useState<Set<string>>(new Set(DIMENSION_ORDER));

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Undo snackbar
  const [undoSnackbar, setUndoSnackbar] = useState<{ open: boolean; entryId: string; token: string } | null>(null);

  // AI Summary
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summarySnackbar, setSummarySnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Edit project
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete project
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/pulse/projects/${projectId}`);
      const data = await res.json();
      if (data.success) {
        setProject(data.data);
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to fetch project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleAISummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/pulse/projects/${projectId}/summary`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success) {
        setSummarySnackbar({
          open: true,
          message: '项目总结已生成并发送到飞书！',
          severity: 'success'
        });
      } else {
        setSummarySnackbar({
          open: true,
          message: data.error || 'AI 总结失败',
          severity: 'error'
        });
      }
    } catch (error) {
      setSummarySnackbar({
        open: true,
        message: '网络错误，请重试',
        severity: 'error'
      });
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleEditClick = () => {
    if (project) {
      setEditedName(project.name);
      setEditDialogOpen(true);
    }
  };

  const handleEditSave = async () => {
    if (!editedName.trim()) {
      setError('项目名称不能为空');
      return;
    }

    setEditLoading(true);
    try {
      const res = await fetch(`/api/pulse/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editedName.trim() })
      });
      const data = await res.json();

      if (data.success) {
        setProject(data.data);
        setEditDialogOpen(false);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch {
      setError('修改项目名称失败');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteProjectClick = () => {
    setDeleteProjectDialogOpen(true);
  };

  const handleDeleteProjectConfirm = async () => {
    setDeleteProjectLoading(true);
    try {
      const res = await fetch(`/api/pulse/projects/${projectId}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        // Redirect to project list after successful deletion
        router.push('/pulse');
      } else {
        setError(data.error);
        setDeleteProjectDialogOpen(false);
      }
    } catch {
      setError('删除项目失败');
      setDeleteProjectDialogOpen(false);
    } finally {
      setDeleteProjectLoading(false);
    }
  };

  const toggleDimension = (dimension: string) => {
    setExpandedDimensions(prev => {
      const next = new Set(prev);
      if (next.has(dimension)) {
        next.delete(dimension);
      } else {
        next.add(dimension);
      }
      return next;
    });
  };

  const handleDeleteClick = (entry: Entry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!entryToDelete) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/pulse/entries/${entryToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setDeleteDialogOpen(false);
        setEntryToDelete(null);

        // Show undo snackbar
        setUndoSnackbar({
          open: true,
          entryId: entryToDelete.id,
          token: data.deleteToken,
        });

        // Auto-close after undo window
        setTimeout(() => {
          setUndoSnackbar(null);
        }, UNDO_WINDOW_MS);

        // Refresh project
        fetchProject();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  const handleUndo = async () => {
    if (!undoSnackbar) return;

    try {
      const res = await fetch(`/api/pulse/entries/${undoSnackbar.entryId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: undoSnackbar.token }),
      });
      const data = await res.json();

      if (data.success) {
        setUndoSnackbar(null);
        fetchProject();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to undo delete');
    }
  };

  // Filter entries
  const filteredEntries = project?.entries.filter(entry => {
    if (dimensionFilter !== 'ALL' && entry.dimension !== dimensionFilter) {
      return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.evidenceCurrent.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  // Group entries by dimension
  const entriesByDimension = DIMENSION_ORDER.reduce((acc, dim) => {
    acc[dim] = filteredEntries.filter(e => e.dimension === dim);
    return acc;
  }, {} as Record<string, Entry[]>);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!project) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">项目不存在</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => router.push('/pulse')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flex: 1 }}>
          {project.name}
        </Typography>
        <IconButton
          size="small"
          onClick={handleEditClick}
          sx={{ ml: 1 }}
        >
          <EditIcon />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          onClick={handleDeleteProjectClick}
        >
          <DeleteIcon />
        </IconButton>
        <Button
          variant="outlined"
          startIcon={<AutoAwesomeIcon />}
          onClick={handleAISummary}
          disabled={summaryLoading || !project.entries || project.entries.length === 0}
        >
          {summaryLoading ? <CircularProgress size={20} /> : 'AI 总结'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<UploadIcon />}
          onClick={() => router.push(`/pulse/${projectId}/upload`)}
        >
          上传报告
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push(`/pulse/${projectId}/entries/new`)}
        >
          手动添加
        </Button>
      </Box>

      {/* Summary Snackbar */}
      <Snackbar
        open={summarySnackbar.open}
        autoHideDuration={6000}
        onClose={() => setSummarySnackbar({ ...summarySnackbar, open: false })}
      >
        <Alert
          severity={summarySnackbar.severity}
          onClose={() => setSummarySnackbar({ ...summarySnackbar, open: false })}
        >
          {summarySnackbar.message}
        </Alert>
      </Snackbar>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>维度筛选</InputLabel>
            <Select
              value={dimensionFilter}
              label="维度筛选"
              onChange={(e) => setDimensionFilter(e.target.value)}
            >
              <MenuItem value="ALL">全部维度</MenuItem>
              {DIMENSION_ORDER.map(dim => (
                <MenuItem key={dim} value={dim}>
                  {DIMENSION_LABELS[dim]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            placeholder="搜索条目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flex: 1, maxWidth: 400 }}
          />
        </Box>
      </Paper>

      {/* Entries by dimension */}
      {filteredEntries.length === 0 ? (
        <Alert severity="info">
          暂无条目，点击&ldquo;上传报告&rdquo;进行AI提取或&ldquo;手动添加&rdquo;创建条目
        </Alert>
      ) : (
        DIMENSION_ORDER.map(dim => {
          const dimEntries = entriesByDimension[dim];
          if (dimensionFilter !== 'ALL' && dimensionFilter !== dim) return null;
          if (dimEntries.length === 0 && dimensionFilter === 'ALL') return null;

          return (
            <Paper key={dim} sx={{ mb: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  p: 2,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => toggleDimension(dim)}
              >
                {expandedDimensions.has(dim) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                <Typography variant="h6" sx={{ ml: 1, flex: 1 }}>
                  {DIMENSION_LABELS[dim]}
                </Typography>
                <Chip label={dimEntries.length} size="small" />
              </Box>

              <Collapse in={expandedDimensions.has(dim)}>
                <Box sx={{ px: 2, pb: 2 }}>
                  {dimEntries.map(entry => (
                    <Paper
                      key={entry.id}
                      variant="outlined"
                      sx={{ p: 2, mb: 1, '&:last-child': { mb: 0 } }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {entry.title}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              mt: 1,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {entry.evidenceCurrent}
                          </Typography>
                          <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Chip
                              label={entry.sourceCurrent.fileName}
                              size="small"
                              variant="outlined"
                            />
                            <Typography variant="caption" color="text.secondary">
                              更新于 {new Date(entry.updatedAt).toLocaleString('zh-CN')}
                            </Typography>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => router.push(`/pulse/${projectId}/entries/${entry.id}`)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteClick(entry)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Collapse>
            </Paper>
          );
        })
      )}

      {/* Delete entry confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除条目 &ldquo;{entryToDelete?.title}&rdquo; 吗？删除后有5秒时间可以撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>取消</Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting}>
            {deleting ? '删除中...' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit project dialog */}
      <Dialog open={editDialogOpen} onClose={() => !editLoading && setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑项目名称</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="项目名称"
            type="text"
            fullWidth
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            disabled={editLoading}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={editLoading}>
            取消
          </Button>
          <Button onClick={handleEditSave} variant="contained" disabled={editLoading || !editedName.trim()}>
            {editLoading ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete project confirmation dialog */}
      <Dialog open={deleteProjectDialogOpen} onClose={() => !deleteProjectLoading && setDeleteProjectDialogOpen(false)}>
        <DialogTitle>确认删除项目</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除项目 &ldquo;{project.name}&rdquo; 吗？
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2 }}>
            删除项目将同时删除该项目下的所有报告和条目，此操作不可恢复！
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteProjectDialogOpen(false)} disabled={deleteProjectLoading}>
            取消
          </Button>
          <Button onClick={handleDeleteProjectConfirm} color="error" variant="contained" disabled={deleteProjectLoading}>
            {deleteProjectLoading ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo snackbar */}
      <Snackbar
        open={undoSnackbar?.open ?? false}
        message="条目已删除"
        action={
          <Button color="secondary" size="small" onClick={handleUndo}>
            撤销
          </Button>
        }
      />
    </Box>
  );
}
