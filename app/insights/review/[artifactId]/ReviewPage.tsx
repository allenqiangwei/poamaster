'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  TextField,
  IconButton,
  Chip,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { DIMENSION_LABELS, DIMENSION_ORDER } from '@/lib/insights/constants';
import type { Artifact, Assignee, DraftItem } from '@prisma/client';

type ArtifactWithRelations = Artifact & {
  assignee: Assignee;
  draftItems: DraftItem[];
};

export default function ReviewPage({ artifact }: { artifact: ArtifactWithRelations }) {
  const router = useRouter();
  const [items, setItems] = useState(artifact.draftItems);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    itemId: string | null;
  }>({ open: false, itemId: null });

  // Group items by dimension
  const itemsByDimension = items.reduce((acc, item) => {
    if (!acc[item.dimension]) {
      acc[item.dimension] = [];
    }
    acc[item.dimension].push(item);
    return acc;
  }, {} as Record<string, DraftItem[]>);

  const handleConfirm = async () => {
    if (items.length === 0) {
      setSnackbar({
        open: true,
        message: '没有可确认的条目',
        severity: 'error',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/insights/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactId: artifact.id,
          items: items.map((item) => ({
            dimension: item.dimension,
            content: item.content,
            decisionType: item.decisionType,
            action: item.action,
            etaText: item.etaText,
          })),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSnackbar({
          open: true,
          message: `成功确认 ${data.confirmedCount} 个条目`,
          severity: 'success',
        });
        // Redirect to assignee detail page after a short delay
        setTimeout(() => {
          router.push(`/assignees/${artifact.assigneeId}`);
        }, 1500);
      } else {
        setSnackbar({
          open: true,
          message: `确认失败: ${data.error}`,
          severity: 'error',
        });
      }
    } catch (error) {
      console.error('Confirm error:', error);
      setSnackbar({
        open: true,
        message: '确认失败,请稍后重试',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (itemId: string) => {
    setDeleteDialog({ open: true, itemId });
  };

  const handleConfirmDelete = () => {
    const { itemId } = deleteDialog;
    setDeleteDialog({ open: false, itemId: null });

    if (itemId) {
      setItems(items.filter((item) => item.id !== itemId));
      setSnackbar({
        open: true,
        message: '已删除条目',
        severity: 'success',
      });
    }
  };

  const handleEdit = (itemId: string, newContent: string) => {
    setItems(
      items.map((item) =>
        item.id === itemId ? { ...item, content: newContent } : item
      )
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => router.back()}
          sx={{ mr: 2 }}
          aria-label="返回"
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" gutterBottom>
            审核对话洞察
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              负责人: <strong>{artifact.assignee.name}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              文件: <strong>{artifact.fileName}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              字符数: <strong>{artifact.charCount.toLocaleString()}</strong>
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<CheckCircleIcon />}
          onClick={handleConfirm}
          disabled={loading || items.length === 0}
          size="large"
        >
          {loading ? '确认中...' : `确认入库 (${items.length})`}
        </Button>
      </Box>

      {/* Items by dimension */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {DIMENSION_ORDER.map((dimension) => {
          const dimensionItems = itemsByDimension[dimension] || [];
          if (dimensionItems.length === 0) return null;

          return (
            <Paper key={dimension} sx={{ p: 3 }} elevation={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>
                  {DIMENSION_LABELS[dimension]}
                </Typography>
                <Chip
                  label={`${dimensionItems.length} 条`}
                  color="primary"
                  variant="outlined"
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dimensionItems.map((item) => (
                  <Paper
                    key={item.id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      backgroundColor: 'grey.50',
                      '&:hover': {
                        backgroundColor: 'grey.100',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        value={item.content}
                        onChange={(e) => handleEdit(item.id, e.target.value)}
                        variant="outlined"
                        size="small"
                      />
                      <IconButton
                        onClick={() => handleDeleteClick(item.id)}
                        color="error"
                        size="small"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>

                    {/* Evidence */}
                    {item.evidence && (
                      <Box
                        sx={{
                          mt: 1,
                          p: 1.5,
                          backgroundColor: 'background.paper',
                          borderLeft: 3,
                          borderColor: 'grey.300',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          证据:
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {item.evidence}
                        </Typography>
                      </Box>
                    )}

                    {/* Decision Type */}
                    {item.decisionType && (
                      <Box sx={{ mt: 1 }}>
                        <Chip
                          label={`类型: ${item.decisionType}`}
                          color="info"
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    )}

                    {/* Action with ETA */}
                    {item.action && (
                      <Box sx={{ mt: 1 }}>
                        <Chip
                          label={`行动: ${item.action}${item.etaText ? ` (ETA: ${item.etaText})` : ''}`}
                          color="success"
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>
            </Paper>
          );
        })}
      </Box>

      {/* Empty state */}
      {items.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            没有待审核的条目
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            所有条目已被删除或文件中没有提取到内容
          </Typography>
        </Paper>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, itemId: null })}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除这个条目吗？此操作不可恢复。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, itemId: null })}>
            取消
          </Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained" autoFocus>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
