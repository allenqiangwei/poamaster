'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Typography,
  Box,
  Alert
} from '@mui/material';
import { useState, useEffect } from 'react';

interface ModelSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (model: string) => void;
  title?: string;
  description?: string;
}

export default function ModelSelectionDialog({
  open,
  onClose,
  onConfirm,
  title = '选择 AI 模型',
  description = '请选择用于此次提取的 GPT 模型'
}: ModelSelectionDialogProps) {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadAllowedModels();
    }
  }, [open]);

  const loadAllowedModels = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/config', { credentials: 'include' });
      const data = await res.json();
      const allowed = (data['openai.allowedModels'] || 'gpt-4o,gpt-4o-mini')
        .split(',')
        .filter(Boolean);

      setAllowedModels(allowed);
      setSelectedModel(allowed[0] || 'gpt-4o');
    } catch (err) {
      console.error('Failed to load allowed models:', err);
      setError('加载模型列表失败');
      // 使用默认值
      setAllowedModels(['gpt-4o', 'gpt-4o-mini']);
      setSelectedModel('gpt-4o');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedModel) {
      onConfirm(selectedModel);
      onClose();
    }
  };

  const getModelDescription = (modelId: string): string => {
    const descriptions: Record<string, string> = {
      'gpt-4o': '最新多模态模型，高性能，支持图片和文本',
      'gpt-4o-mini': '轻量级版本，快速且经济',
      'gpt-4-turbo': '强大的推理能力，适合复杂任务',
      'gpt-4': '经典 GPT-4，可靠稳定',
      'gpt-3.5-turbo': '快速且低成本，适合简单任务'
    };
    return descriptions[modelId] || '通用 GPT 模型';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography color="text.secondary">加载中...</Typography>
          </Box>
        ) : allowedModels.length === 0 ? (
          <Alert severity="warning">
            未配置允许使用的模型。请前往设置页面配置。
          </Alert>
        ) : (
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {allowedModels.map((modelId) => (
                <FormControlLabel
                  key={modelId}
                  value={modelId}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1" fontWeight={500}>
                        {modelId}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {getModelDescription(modelId)}
                      </Typography>
                    </Box>
                  }
                  sx={{ mb: 1, alignItems: 'flex-start' }}
                />
              ))}
            </RadioGroup>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!selectedModel || loading}
        >
          确认使用
        </Button>
      </DialogActions>
    </Dialog>
  );
}
