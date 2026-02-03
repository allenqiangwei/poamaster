'use client';

import { useState } from 'react';
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

interface MaterialInputProps {
  onSubmit: (data: { title: string; materialText: string; files: File[] }) => void;
  loading?: boolean;
}

export default function MaterialInput({ onSubmit, loading }: MaterialInputProps) {
  const [title, setTitle] = useState('');
  const [materialText, setMaterialText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    // 验证文件
    const validFiles = selectedFiles.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext || '')) {
        setError(`不支持的文件类型: ${file.name}`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`文件过大: ${file.name} (最大10MB)`);
        return false;
      }
      return true;
    });

    setFiles(prev => [...prev, ...validFiles].slice(0, 5));
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

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
    onSubmit({ title, materialText, files });
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

      <TextField
        fullWidth
        multiline
        rows={10}
        label="材料内容（可选，如果上传了文件）"
        placeholder="粘贴或输入讨论材料..."
        value={materialText}
        onChange={(e) => setMaterialText(e.target.value)}
        disabled={loading}
        sx={{ mb: 3 }}
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          文件上传（可选，最多5个文件）
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          支持PDF、PNG、JPG格式，单个文件最大10MB
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
    </Box>
  );
}
