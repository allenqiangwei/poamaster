'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress,
  IconButton,
  Tabs,
  Tab
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Upload as UploadIcon, ContentPaste as ContentPasteIcon } from '@mui/icons-material';
import { ExtractedTask } from '@/lib/openai';
import TaskPreviewTable from '@/components/TaskPreviewTable';

export default function NewTaskPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [inputMode, setInputMode] = useState<'text' | 'file'>('text');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 监听全局粘贴事件
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 如果在文本框中粘贴，让浏览器默认处理
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      // 检查是否有图片
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            setSelectedFile(file);
            setInputMode('file');
            setError('');

            // 生成预览
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);

            // 显示提示
            setError('');
          }
          return;
        }
      }

      // 检查是否有文本（非在输入框中）
      const text = e.clipboardData?.getData('text');
      if (text && text.trim().length > 0) {
        e.preventDefault();
        setText(text);
        setInputMode('text');
        setError('');
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setError('只支持 PDF、JPG、PNG 和 WEBP 格式');
        return;
      }
      setSelectedFile(file);
      setError('');

      // 如果是图片，生成预览
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (loading) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        setError('只支持 PDF、JPG、PNG 和 WEBP 格式');
        return;
      }
      setSelectedFile(file);
      setError('');

      // 如果是图片，生成预览
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    }
  };

  const handleExtract = async () => {
    if (inputMode === 'text' && !text.trim()) {
      setError('请输入要提取的文本内容');
      return;
    }

    if (inputMode === 'file' && !selectedFile) {
      setError('请选择要上传的文件');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let res;

      if (inputMode === 'text') {
        res = await fetch('/api/tasks/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          credentials: 'include'
        });
      } else {
        const formData = new FormData();
        formData.append('file', selectedFile!);

        res = await fetch('/api/tasks/extract-from-file', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
      }

      const data = await res.json();

      if (res.ok) {
        if (data.tasks.length === 0) {
          setError('未识别到任务，请检查输入内容');
        } else {
          setExtractedTasks(data.tasks);
        }
      } else {
        setError(data.error || '提取失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      // 批量创建任务
      for (const task of extractedTasks) {
        let assigneeId: string | undefined = undefined;

        // 如果有负责人，先查找或创建负责人记录
        if (task.assignee && task.assignee.trim().length > 0) {
          // 查找负责人
          const assigneesRes = await fetch('/api/assignees', {
            credentials: 'include'
          });
          const assigneesData = await assigneesRes.json();

          if (assigneesRes.ok && assigneesData.success) {
            const existingAssignee = assigneesData.data.find(
              (a: any) => a.name === task.assignee
            );

            if (existingAssignee) {
              assigneeId = existingAssignee.id;
            } else {
              // 负责人不存在，创建新的负责人
              const createAssigneeRes = await fetch('/api/assignees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: task.assignee }),
                credentials: 'include'
              });

              const createAssigneeData = await createAssigneeRes.json();
              if (createAssigneeRes.ok && createAssigneeData.success) {
                assigneeId = createAssigneeData.data.id;
              }
            }
          }
        }

        // 创建任务
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            dod: task.dod,
            dueDate: task.dueDate,
            status: 'TODO',
            assigneeId
          }),
          credentials: 'include'
        });

        if (!res.ok) {
          throw new Error('Failed to create task');
        }
      }

      router.push('/todo');
    } catch {
      setError('保存任务失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton
          onClick={() => router.back()}
          sx={{ mr: 2 }}
          aria-label="返回"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">
          AI 提取任务
        </Typography>
      </Box>

      {extractedTasks.length === 0 ? (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Tabs value={inputMode} onChange={(_, value) => setInputMode(value)} sx={{ mb: 3 }}>
            <Tab label="文本输入" value="text" />
            <Tab label="文件上传" value="file" />
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {inputMode === 'text' ? (
            <>
              <Typography variant="h6" gutterBottom>
                粘贴文本内容
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  支持从会议记录、邮件、备忘录等文本中提取任务
                </Typography>
                <Typography variant="body2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ContentPasteIcon fontSize="small" />
                  Ctrl+V 快速粘贴
                </Typography>
              </Box>

              <TextField
                multiline
                rows={10}
                fullWidth
                placeholder="例如：
明天下午3点前，张三需要完成用户认证模块的开发，要求代码通过测试并部署。
李四负责提交项目周报，截止今天下午5点。
王五本周内完成数据库设计文档。

💡 提示：也可以直接按 Ctrl+V 粘贴文本或图片"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </>
          ) : (
            <>
              <Typography variant="h6" gutterBottom>
                上传文件
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary">
                  支持 PDF、JPG、PNG、WEBP 格式
                </Typography>
                <Typography variant="body2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <UploadIcon fontSize="small" />
                  拖拽上传
                </Typography>
                <Typography variant="body2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ContentPasteIcon fontSize="small" />
                  Ctrl+V 粘贴
                </Typography>
              </Box>

              <Box
                sx={{
                  border: '2px dashed',
                  borderColor: isDragging ? 'primary.main' : selectedFile ? 'success.main' : 'grey.300',
                  borderRadius: 2,
                  p: 4,
                  textAlign: 'center',
                  bgcolor: isDragging ? 'primary.50' : selectedFile ? 'success.50' : 'grey.50',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: loading ? 'grey.300' : 'primary.main',
                    bgcolor: loading ? 'grey.50' : 'primary.50',
                  },
                }}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => {
                  if (!loading) {
                    document.getElementById('file-upload')?.click();
                  }
                }}
              >
                {previewUrl && selectedFile?.type.startsWith('image/') ? (
                  <Box onClick={(e) => e.stopPropagation()}>
                    <Box
                      component="img"
                      src={previewUrl}
                      alt="预览"
                      sx={{
                        maxWidth: '100%',
                        maxHeight: 400,
                        mb: 2,
                        borderRadius: 1
                      }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {selectedFile.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      拖拽新文件或点击背景更换
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                    >
                      清除
                    </Button>
                  </Box>
                ) : (
                  <>
                    <input
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      style={{ display: 'none' }}
                      id="file-upload"
                      type="file"
                      onChange={handleFileChange}
                      disabled={loading}
                    />
                    <UploadIcon
                      sx={{
                        fontSize: 48,
                        color: isDragging ? 'primary.main' : selectedFile ? 'success.main' : 'grey.400',
                        mb: 1
                      }}
                    />
                    {selectedFile ? (
                      <>
                        <Typography variant="body1" color="success.main" fontWeight={500}>
                          {selectedFile.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          拖拽新文件或点击更换
                        </Typography>
                      </>
                    ) : (
                      <>
                        <Typography variant="body1" color={isDragging ? 'primary.main' : 'text.primary'}>
                          {isDragging ? '松开以上传文件' : '拖拽文件到此处，或点击选择'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          支持格式: PDF、JPG、PNG、WEBP
                        </Typography>
                      </>
                    )}
                  </>
                )}
              </Box>
            </>
          )}

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleExtract}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '提取任务'}
            </Button>
            <Button variant="outlined" onClick={() => router.back()}>
              取消
            </Button>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            提取结果（共 {extractedTasks.length} 个任务）
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            请检查并修改提取的任务信息
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TaskPreviewTable
            tasks={extractedTasks}
            onChange={setExtractedTasks}
          />

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '保存所有任务'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => setExtractedTasks([])}
            >
              重新提取
            </Button>
          </Box>
        </Box>
      )}
    </Container>
  );
}
