'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  LinearProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
} from '@mui/material';
import { CloudUpload as UploadIcon, Delete as DeleteIcon } from '@mui/icons-material';
import ModelSelectionDialog from '@/components/ModelSelectionDialog';

interface MaterialInputProps {
  onSubmit: (data: { title: string; materialText: string; files: File[]; model?: string }) => void;
  loading?: boolean;
}

export default function MaterialInput({ onSubmit, loading }: MaterialInputProps) {
  const [title, setTitle] = useState('');
  const [materialText, setMaterialText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{ title: string; materialText: string; files: File[] } | null>(null);

  const validateFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext || '')) {
      setError(`不支持的文件类型: ${file.name}。支持 PDF、PNG、JPG 格式`);
      return false;
    }

    // PDF 文件支持 50MB，图片文件支持 10MB
    const maxSize = ext === 'pdf' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    const maxSizeLabel = ext === 'pdf' ? '50MB' : '10MB';

    if (file.size > maxSize) {
      setError(`文件过大: ${file.name} (最大${maxSizeLabel})`);
      return false;
    }
    return true;
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(validateFile);
    if (validFiles.length > 0) {
      setFiles(prev => {
        const combined = [...prev, ...validFiles];
        if (combined.length > 5) {
          setError('最多只能上传5个文件');
          return combined.slice(0, 5);
        }
        setError('');

        // 如果标题为空且这是第一个文件，自动设置标题为文件名 + " 讨论"
        if (prev.length === 0 && !title.trim() && validFiles.length > 0) {
          const firstFile = validFiles[0];
          // 移除文件扩展名
          const fileNameWithoutExt = firstFile.name.replace(/\.[^/.]+$/, '');
          setTitle(`${fileNameWithoutExt} 讨论`);
        }

        return combined;
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 拖拽处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (loading) return;

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  // 粘贴处理
  const handlePaste = (e: ClipboardEvent) => {
    if (loading) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // 处理图片粘贴
      if (item.type.startsWith('image/')) {
        e.preventDefault();

        const blob = item.getAsFile();
        if (blob) {
          const extension = item.type.split('/')[1];
          const fileName = `pasted-image-${Date.now()}.${extension}`;
          const file = new File([blob], fileName, { type: item.type });
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length > 0) {
      addFiles(pastedFiles);
    }
  };

  // 添加和移除粘贴事件监听
  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [loading, files]);

  const handleSubmit = () => {
    if (!title.trim()) {
      setError('请输入讨论标题');
      return;
    }

    if (!materialText.trim() && files.length === 0) {
      setError('请输入文本材料或上传文件');
      return;
    }

    setError('');
    // 打开模型选择对话框
    setPendingSubmit({ title, materialText, files });
    setModelDialogOpen(true);
  };

  const handleModelConfirm = (model: string) => {
    if (pendingSubmit) {
      onSubmit({ ...pendingSubmit, model });
      setPendingSubmit(null);
    }
    setModelDialogOpen(false);
  };

  return (
    <Box>
      <TextField
        fullWidth
        label="讨论标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={loading}
        sx={{ mb: 3 }}
      />

      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <TextField
          fullWidth
          multiline
          rows={10}
          label="材料内容（可选，如果上传了文件）"
          placeholder="粘贴或输入讨论材料...&#10;&#10;💡 支持直接粘贴图片 (⌘+V / Ctrl+V)&#10;💡 支持拖拽文件到此区域"
          value={materialText}
          onChange={(e) => setMaterialText(e.target.value)}
          disabled={loading}
          sx={{
            mb: 3,
            '& .MuiOutlinedInput-root': {
              backgroundColor: isDragging ? 'action.hover' : 'background.paper',
              transition: 'background-color 0.2s',
            }
          }}
        />
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 3,
          border: isDragging ? '2px dashed' : '1px solid',
          borderColor: isDragging ? 'primary.main' : 'divider',
          backgroundColor: isDragging ? 'action.hover' : 'background.paper',
          transition: 'all 0.2s',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Typography variant="subtitle2" gutterBottom>
          文件上传（可选，最多5个文件）
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          支持 PDF（最大50MB）、PNG/JPG（最大10MB）格式
        </Typography>
        <Typography variant="caption" color="primary.main" display="block" sx={{ mb: 2 }}>
          💡 可以拖拽文件到此处，或粘贴剪贴板中的图片
        </Typography>

        <Button
          component="label"
          variant="outlined"
          startIcon={<UploadIcon />}
          disabled={loading || files.length >= 5}
        >
          选择文件
          <input
            type="file"
            hidden
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
          />
        </Button>

        {files.length > 0 && (
          <List dense sx={{ mt: 2 }}>
            {files.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={() => handleRemoveFile(index)}
                    disabled={loading}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={file.name}
                  secondary={`${(file.size / 1024).toFixed(1)} KB`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? '提交中...' : '开始讨论'}
      </Button>

      <ModelSelectionDialog
        open={modelDialogOpen}
        onClose={() => setModelDialogOpen(false)}
        onConfirm={handleModelConfirm}
        title="选择讨论模型"
        description="选择用于圆桌讨论的 AI 模型。不同模型在推理能力、速度和成本上有所不同。"
      />
    </Box>
  );
}
