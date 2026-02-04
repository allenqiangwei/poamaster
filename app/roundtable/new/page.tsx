'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  Alert,
  CircularProgress,
} from '@mui/material';
import { ArrowBack as BackIcon } from '@mui/icons-material';
import TemplateSelector from '@/components/roundtable/TemplateSelector';
import MaterialInput from '@/components/roundtable/MaterialInput';

export default function NewDiscussionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode'); // 'quick' or 'select'

  const [activeStep, setActiveStep] = useState(mode === 'quick' ? 0 : 0);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [autoSelectLoading, setAutoSelectLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = mode === 'quick'
    ? ['输入材料', '确认模板', '开始讨论']
    : ['选择模板', '输入材料', '开始讨论'];

  const handleTemplateSelect = (template: any) => {
    setSelectedTemplate(template);
    if (mode === 'select') {
      setActiveStep(1);
    }
  };

  const handleMaterialSubmit = async (data: { title: string; materialText: string; files: File[]; model?: string }) => {
    if (mode === 'quick') {
      // 快速开始模式：先自动选择模板
      setAutoSelectLoading(true);
      try {
        const res = await fetch('/api/roundtable/auto-select-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ material: data.materialText }),
        });

        if (!res.ok) throw new Error('Failed to select template');

        const result = await res.json();
        setSelectedTemplate(result.template);
        setActiveStep(1); // 显示确认模板步骤
        setAutoSelectLoading(false);

        // 暂存材料数据
        (window as any).__roundtableMaterialData = data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setAutoSelectLoading(false);
      }
    } else {
      // 选择模板模式：直接创建讨论
      await createDiscussion(data);
    }
  };

  const handleConfirmTemplate = async () => {
    const data = (window as any).__roundtableMaterialData;
    if (!data) return;

    await createDiscussion(data);
  };

  const createDiscussion = async (data: { title: string; materialText: string; files: File[]; model?: string }) => {
    setSubmitLoading(true);
    setActiveStep(2);

    try {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('templateId', selectedTemplate.id);
      formData.append('materialText', data.materialText);
      if (data.model) {
        formData.append('model', data.model);
      }
      data.files.forEach(file => formData.append('files', file));

      const res = await fetch('/api/roundtable/discussions', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to create discussion');

      const discussion = await res.json();
      router.push(`/roundtable/discussions/${discussion.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <Button
          startIcon={<BackIcon />}
          onClick={() => router.push('/roundtable')}
          sx={{ mr: 2 }}
        >
          返回
        </Button>
        <Typography variant="h5">
          {mode === 'quick' ? '快速开始' : '选择模板'}
        </Typography>
      </Box>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        {/* 步骤0：选择模板（仅select模式） */}
        {activeStep === 0 && mode === 'select' && (
          <TemplateSelector
            onSelect={handleTemplateSelect}
            selectedId={selectedTemplate?.id}
          />
        )}

        {/* 步骤0：输入材料（quick模式） */}
        {activeStep === 0 && mode === 'quick' && (
          <MaterialInput
            onSubmit={handleMaterialSubmit}
            loading={autoSelectLoading}
          />
        )}

        {/* 步骤1：确认模板（quick模式自动选择后） */}
        {activeStep === 1 && mode === 'quick' && selectedTemplate && (
          <Box>
            <Typography variant="h6" gutterBottom>
              已为您选择模板
            </Typography>
            <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
              <Typography variant="h5" gutterBottom>
                {selectedTemplate.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedTemplate.description}
              </Typography>
            </Paper>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setActiveStep(0)}
              >
                重新输入
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirmTemplate}
                disabled={submitLoading}
              >
                确认并开始讨论
              </Button>
            </Box>
          </Box>
        )}

        {/* 步骤1：输入材料（select模式） */}
        {activeStep === 1 && mode === 'select' && (
          <MaterialInput
            onSubmit={handleMaterialSubmit}
            loading={submitLoading}
          />
        )}

        {/* 步骤2：提交中 */}
        {activeStep === 2 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              正在创建讨论...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              即将跳转到讨论详情页
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
