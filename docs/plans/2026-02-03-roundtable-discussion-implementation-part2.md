# 圆桌会议功能实施计划（第二部分）

> 这是实施计划的第二部分，包含 Phase 4-6

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

---

## Phase 4: 前端界面

### Task 8: 在首页添加圆桌会议卡片

**Files:**
- Modify: `app/(dashboard)/page.tsx`

**Step 1: 添加圆桌会议卡片**

在导入部分添加图标：
```typescript
import { Forum as RoundtableIcon } from '@mui/icons-material';
```

在现有的两个Card之后添加第三个卡片：

```typescript
<Card>
  <CardContent>
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
      <RoundtableIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
      <Typography variant="h5">
        圆桌会议
      </Typography>
    </Box>
    <Typography variant="body2" color="text.secondary">
      AI多角色讨论系统，为战略决策、项目提案提供全方位审查和建议
    </Typography>
  </CardContent>
  <CardActions>
    <Button
      size="small"
      variant="contained"
      fullWidth
      onClick={() => router.push('/roundtable')}
    >
      进入工具
    </Button>
  </CardActions>
</Card>
```

**Step 2: 提交**

```bash
git add app/\(dashboard\)/page.tsx
git commit -m "feat(roundtable): add roundtable card to homepage

- Add third card for roundtable discussion tool
- Use Forum icon from MUI
- Link to /roundtable route"
```

---

### Task 9: 创建圆桌会议主页面

**Files:**
- Create: `app/roundtable/page.tsx`
- Create: `app/roundtable/layout.tsx`

**Step 1: 创建布局文件**

`app/roundtable/layout.tsx`:
```typescript
import { Box, Container } from '@mui/material';

export default function RoundtableLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {children}
    </Container>
  );
}
```

**Step 2: 创建主页面**

`app/roundtable/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Add as AddIcon, PlayArrow as QuickStartIcon } from '@mui/icons-material';

export default function RoundtablePage() {
  const router = useRouter();
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDiscussions();
  }, []);

  const fetchDiscussions = async () => {
    try {
      const res = await fetch('/api/roundtable/discussions?limit=10');
      if (!res.ok) throw new Error('Failed to fetch discussions');
      const data = await res.json();
      setDiscussions(data.discussions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">圆桌会议</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => router.push('/roundtable/new?mode=select')}
          >
            选择模板
          </Button>
          <Button
            variant="contained"
            startIcon={<QuickStartIcon />}
            onClick={() => router.push('/roundtable/new?mode=quick')}
          >
            快速开始
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : discussions.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              还没有讨论记录
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              点击"快速开始"或"选择模板"创建第一个讨论
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {discussions.map((discussion: any) => (
            <Card
              key={discussion.id}
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
              onClick={() => router.push(`/roundtable/discussions/${discussion.id}`)}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                  <Typography variant="h6">{discussion.title}</Typography>
                  <Chip
                    label={discussion.status === 'completed' ? '已完成' : discussion.status === 'processing' ? '处理中' : '失败'}
                    size="small"
                    color={discussion.status === 'completed' ? 'success' : discussion.status === 'processing' ? 'primary' : 'error'}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  模板：{discussion.template.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    行动项：{discussion.actions?.length || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    高风险：{discussion.risks?.length || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    创建时间：{new Date(discussion.createdAt).toLocaleString('zh-CN')}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

**Step 3: 提交**

```bash
git add app/roundtable/page.tsx app/roundtable/layout.tsx
git commit -m "feat(roundtable): create roundtable home page

- Display recent discussions list
- Show quick start and select template buttons
- Display discussion status, template, and metadata
- Navigate to discussion details on click"
```

---

### Task 10: 创建讨论创建流程（需要3个组件）

**Files:**
- Create: `components/roundtable/TemplateSelector.tsx`
- Create: `components/roundtable/MaterialInput.tsx`
- Create: `app/roundtable/new/page.tsx`

**Step 1: 创建模板选择器组件**

`components/roundtable/TemplateSelector.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Group as GroupIcon } from '@mui/icons-material';

interface Template {
  id: string;
  name: string;
  description: string;
  scenario: string;
  roles: Array<{ name: string }>;
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  selectedId?: string;
}

export default function TemplateSelector({ onSelect, selectedId }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/roundtable/templates?enabled=true');
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Grid container spacing={2}>
      {templates.map((template) => (
        <Grid item xs={12} sm={6} md={4} key={template.id}>
          <Card
            sx={{
              cursor: 'pointer',
              border: selectedId === template.id ? 2 : 0,
              borderColor: 'primary.main',
              '&:hover': { boxShadow: 3 },
            }}
            onClick={() => onSelect(template)}
          >
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {template.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 60 }}>
                {template.description}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GroupIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  {template.roles.length} 个角色
                </Typography>
              </Box>
              {template.scenario && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {template.scenario}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
```

**Step 2: 创建材料输入组件**

`components/roundtable/MaterialInput.tsx`:
```typescript
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
```

**Step 3: 创建新建讨论页面（整合流程）**

`app/roundtable/new/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
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

  const [activeStep, setActiveStep] = useState(mode === 'quick' ? 1 : 0);
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

  const handleMaterialSubmit = async (data: { title: string; materialText: string; files: File[] }) => {
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

  const createDiscussion = async (data: { title: string; materialText: string; files: File[] }) => {
    setSubmitLoading(true);
    setActiveStep(2);

    try {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('templateId', selectedTemplate.id);
      formData.append('materialText', data.materialText);
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

        {/* 步骤1：输入材料（quick模式）或确认模板（quick模式自动选择后） */}
        {activeStep === 0 && mode === 'quick' && (
          <MaterialInput
            onSubmit={handleMaterialSubmit}
            loading={autoSelectLoading}
          />
        )}

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
```

**Step 4: 提交**

```bash
git add components/roundtable/ app/roundtable/new/
git commit -m "feat(roundtable): create discussion creation flow

- Support quick start and select template modes
- Implement template selector component with grid layout
- Implement material input with file upload and validation
- Auto-select template in quick start mode using AI
- Multi-step wizard with stepper UI
- File validation (type, size, count)"
```

---

### Task 11: 创建讨论详情和报告页面

**Files:**
- Create: `components/roundtable/DiscussionReport.tsx`
- Create: `app/roundtable/discussions/[id]/page.tsx`

**Step 1: 创建报告展示组件**

`components/roundtable/DiscussionReport.tsx`:

由于内容过长，这个文件包含完整的报告展示逻辑，包括：
- 结论摘要卡片
- 行动清单和风险清单
- 讨论过程（可折叠）
- 假设说明和决策依据
- 导出和分享按钮

```typescript
'use client';

import {
  Box,
  Paper,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  Download as DownloadIcon,
  Send as SendIcon,
  Task as TaskIcon,
} from '@mui/icons-material';

interface DiscussionReportProps {
  discussion: any;
  onExportPDF?: () => void;
  onSendToFeishu?: () => void;
  onCreateTask?: (actionId: string) => void;
}

export default function DiscussionReport({
  discussion,
  onExportPDF,
  onSendToFeishu,
  onCreateTask,
}: DiscussionReportProps) {
  const getConclusionColor = (type: string) => {
    switch (type) {
      case 'pass': return 'success';
      case 'conditional_pass': return 'warning';
      case 'reject': return 'error';
      default: return 'info';
    }
  };

  const getConclusionLabel = (type: string) => {
    switch (type) {
      case 'pass': return '通过';
      case 'conditional_pass': return '有条件通过';
      case 'reject': return '打回';
      case 'need_more_info': return '需补充信息';
      default: return type;
    }
  };

  return (
    <Box>
      {/* 结论摘要 */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Typography variant="h5">裁决结论</Typography>
          <Chip
            label={getConclusionLabel(discussion.conclusionType)}
            color={getConclusionColor(discussion.conclusionType)}
          />
        </Box>
        <Typography variant="body1">
          {discussion.conclusion}
        </Typography>
      </Paper>

      {/* 核心信息区 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
        {/* 行动清单 */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            行动清单
          </Typography>
          <List>
            {discussion.actions?.map((action: any) => (
              <ListItem
                key={action.id}
                secondaryAction={
                  !action.taskId && onCreateTask && (
                    <Button
                      size="small"
                      startIcon={<TaskIcon />}
                      onClick={() => onCreateTask(action.id)}
                    >
                      创建任务
                    </Button>
                  )
                }
              >
                <ListItemText
                  primary={action.content}
                  secondary={
                    <Box component="span">
                      {action.assignee && `负责人：${action.assignee} | `}
                      {action.deadline && `截止：${new Date(action.deadline).toLocaleDateString('zh-CN')} | `}
                      <Chip
                        label={action.priority}
                        size="small"
                        color={action.priority === 'high' ? 'error' : action.priority === 'medium' ? 'warning' : 'default'}
                      />
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>

        {/* 风险清单 */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            风险清单
          </Typography>
          <List>
            {discussion.risks?.map((risk: any) => (
              <ListItem key={risk.id}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={risk.priority}
                        size="small"
                        color={risk.priority === 'high' ? 'error' : risk.priority === 'medium' ? 'warning' : 'default'}
                      />
                      <Typography variant="body2">{risk.description}</Typography>
                    </Box>
                  }
                  secondary={
                    <Box component="span">
                      <Typography variant="caption" display="block">
                        影响：{risk.impact}
                      </Typography>
                      {risk.mitigation && (
                        <Typography variant="caption" display="block">
                          缓解：{risk.mitigation}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>

      {/* 讨论过程 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          讨论过程
        </Typography>
        {discussion.rounds?.map((round: any) => (
          <Accordion key={round.id}>
            <AccordionSummary expandIcon={<ExpandIcon />}>
              <Typography>
                回合{round.roundNumber}：
                {round.roundType === 'clarify' ? '澄清' :
                 round.roundType === 'question' ? '质疑' :
                 round.roundType === 'rebuttal' ? '反驳' : '裁决'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {round.messages?.map((message: any) => (
                <Box key={message.id} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="primary.main">
                    {message.roleName}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                    {message.content}
                  </Typography>
                  <Divider sx={{ mt: 2 }} />
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      {/* 附加信息 */}
      {discussion.assumptions && discussion.assumptions.length > 0 && (
        <Accordion sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandIcon />}>
            <Typography>假设说明</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {discussion.assumptions.map((assumption: any) => (
                <ListItem key={assumption.id}>
                  <ListItemText
                    primary={assumption.description}
                    secondary={`置信度：${assumption.confidence} | 依据：${assumption.reasoning}`}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography>决策依据</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {discussion.decisionReasoning}
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* 操作栏 */}
      <Box sx={{ display: 'flex', gap: 2, mt: 4 }}>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={onExportPDF}
        >
          导出PDF
        </Button>
        <Button
          variant="outlined"
          startIcon={<SendIcon />}
          onClick={onSendToFeishu}
        >
          发送到飞书
        </Button>
      </Box>
    </Box>
  );
}
```

**Step 2: 创建讨论详情页面**

`app/roundtable/discussions/[id]/page.tsx`:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import { ArrowBack as BackIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import DiscussionReport from '@/components/roundtable/DiscussionReport';

export default function DiscussionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const discussionId = params.id as string;

  const [discussion, setDiscussion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDiscussion();
    const interval = setInterval(() => {
      if (discussion?.status === 'processing') {
        fetchDiscussion();
      }
    }, 5000); // 每5秒刷新一次处理中的讨论

    return () => clearInterval(interval);
  }, [discussionId, discussion?.status]);

  const fetchDiscussion = async () => {
    try {
      const res = await fetch(`/api/roundtable/discussions/${discussionId}`);
      if (!res.ok) throw new Error('Failed to fetch discussion');
      const data = await res.json();
      setDiscussion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    alert('PDF导出功能将在后续版本实现');
  };

  const handleSendToFeishu = async () => {
    alert('发送到飞书功能将在后续版本实现');
  };

  const handleCreateTask = async (actionId: string) => {
    try {
      const res = await fetch(`/api/roundtable/actions/${actionId}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error('Failed to create task');

      const task = await res.json();
      await fetchDiscussion();
      alert(`任务创建成功！任务ID: ${task.id}`);
    } catch (err) {
      alert('创建任务失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error">{error}</Alert>
        <Button onClick={() => router.push('/roundtable')} sx={{ mt: 2 }}>
          返回列表
        </Button>
      </Box>
    );
  }

  if (!discussion) {
    return <Alert severity="error">讨论不存在</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<BackIcon />}
            onClick={() => router.push('/roundtable')}
          >
            返回
          </Button>
          <Typography variant="h5">{discussion.title}</Typography>
          <Chip
            label={discussion.status === 'completed' ? '已完成' : discussion.status === 'processing' ? '处理中' : '失败'}
            color={discussion.status === 'completed' ? 'success' : discussion.status === 'processing' ? 'primary' : 'error'}
          />
        </Box>
        {discussion.status === 'processing' && (
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchDiscussion}
          >
            刷新
          </Button>
        )}
      </Box>

      {discussion.status === 'processing' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          讨论正在进行中，预计需要3-5分钟。您可以离开页面，完成后会收到飞书通知。
        </Alert>
      )}

      {discussion.status === 'failed' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          讨论处理失败：{discussion.errorMessage}
        </Alert>
      )}

      {discussion.status === 'completed' && (
        <DiscussionReport
          discussion={discussion}
          onExportPDF={handleExportPDF}
          onSendToFeishu={handleSendToFeishu}
          onCreateTask={handleCreateTask}
        />
      )}
    </Box>
  );
}
```

**Step 3: 提交**

```bash
git add components/roundtable/DiscussionReport.tsx app/roundtable/discussions/
git commit -m "feat(roundtable): create discussion detail and report page

- Display discussion status with auto-refresh (5s interval) for processing
- Show comprehensive report: conclusion, actions, risks, discussion rounds
- Collapsible accordion sections for discussion process
- Show assumptions and decision reasoning
- Implement create task integration
- Add placeholders for export PDF and send to Feishu"
```

---

## Phase 5: 系统集成与功能完善

### Task 12: 实现任务创建集成API

**Files:**
- Create: `app/api/roundtable/actions/[id]/create-task/route.ts`

**Step 1: 创建任务创建API**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const actionId = params.id;

    const action = await prisma.roundtableAction.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      );
    }

    // 查找或创建负责人
    let assignee = null;
    if (action.assignee) {
      assignee = await prisma.assignee.findUnique({
        where: { name: action.assignee },
      });

      if (!assignee) {
        assignee = await prisma.assignee.create({
          data: { name: action.assignee },
        });
      }
    }

    // 创建任务
    const task = await prisma.task.create({
      data: {
        title: action.content,
        dod: action.acceptanceCriteria || undefined,
        dueDate: action.deadline || undefined,
        assigneeId: assignee?.id,
        status: 'TODO',
      },
    });

    // 更新action记录
    await prisma.roundtableAction.update({
      where: { id: actionId },
      data: { taskId: task.id },
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    );
  }
}
```

**Step 2: 提交**

```bash
git add app/api/roundtable/actions/
git commit -m "feat(roundtable): implement task creation from action item

- Create task from roundtable action
- Auto-create or find assignee by name
- Link task ID to action record
- Set task title, DOD, due date from action data"
```

---

### Task 13: 更新README文档

**Files:**
- Modify: `README.md`

**Step 1: 在功能特性部分添加圆桌会议**

在"功能特性"部分添加：

```markdown
- 🎯 **圆桌会议**：AI多角色讨论系统，自动审查决策提案和战略方案
```

**Step 2: 在使用说明部分添加**

在适当位置添加：

```markdown
### 圆桌会议

通过AI模拟多角色讨论，为重大决策提供全方位审查：

1. 选择讨论模板或快速开始
2. 输入讨论材料（支持文本和文件）
3. AI自动执行4轮讨论（澄清、质疑、反驳、裁决）
4. 查看详细报告和行动建议
5. 将行动项转化为待办任务
```

**Step 3: 提交**

```bash
git add README.md
git commit -m "docs: add roundtable discussion to README

- Add roundtable to feature list
- Add usage instructions for roundtable
- Describe AI discussion flow"
```

---

### Task 14: 创建部署和初始化脚本

**Files:**
- Create: `scripts/deploy-roundtable.sh`

**Step 1: 创建部署脚本**

```bash
#!/bin/bash

echo "🚀 部署圆桌会议功能..."

# 运行数据库迁移
echo "📊 运行数据库迁移..."
npx prisma migrate deploy

# 生成Prisma Client
echo "🔧 生成Prisma Client..."
npx prisma generate

# 初始化模板
echo "📝 初始化讨论模板..."
npx ts-node scripts/init-roundtable-templates.ts

# 创建上传目录
echo "📁 创建文件上传目录..."
mkdir -p public/uploads/roundtable

echo "✅ 圆桌会议功能部署完成!"
echo ""
echo "提示："
echo "1. 确保已配置 OpenAI API Key"
echo "2. 确保已配置飞书通知（可选）"
echo "3. 重启应用以应用所有更改"
```

**Step 2: 设置执行权限**

```bash
chmod +x scripts/deploy-roundtable.sh
```

**Step 3: 提交**

```bash
git add scripts/deploy-roundtable.sh
git commit -m "chore: add roundtable deployment script

- Run database migrations
- Generate Prisma client
- Initialize 10 predefined templates
- Create upload directories
- Add deployment instructions"
```

---

## Phase 6: 测试和验收

### Task 15: 创建功能验收清单

**Files:**
- Create: `docs/roundtable-acceptance.md`

**Step 1: 创建验收清单**

```markdown
# 圆桌会议功能验收清单

## 数据库验收 ✓

- [ ] 所有9个表成功创建（RoundtableTemplate, RoundtableRole, RoundtableDiscussion, RoundtableRound, RoundtableMessage, RoundtableAction, RoundtableRisk, RoundtableAttachment, RoundtableAssumption）
- [ ] 10个模板成功初始化
- [ ] 每个模板包含4个角色配置
- [ ] 所有表使用 roundtable_ 前缀（数据隔离）

## API端点验收 ✓

- [ ] GET /api/roundtable/templates - 获取模板列表
- [ ] GET /api/roundtable/templates/[id] - 获取模板详情
- [ ] PATCH /api/roundtable/templates/[id] - 更新模板
- [ ] POST /api/roundtable/discussions - 创建讨论
- [ ] GET /api/roundtable/discussions - 获取讨论列表（分页）
- [ ] GET /api/roundtable/discussions/[id] - 获取讨论详情
- [ ] POST /api/roundtable/auto-select-template - 自动选择模板
- [ ] POST /api/roundtable/actions/[id]/create-task - 创建任务

## 功能流程验收 ✓

### 快速开始流程
- [ ] 进入圆桌会议主页
- [ ] 点击"快速开始"按钮
- [ ] 输入讨论标题和材料
- [ ] 上传文件（PDF/图片）
- [ ] 提交后AI自动选择模板
- [ ] 显示推荐模板和置信度
- [ ] 确认模板后创建讨论
- [ ] 跳转到讨论详情页

### 选择模板流程
- [ ] 点击"选择模板"按钮
- [ ] 展示10个模板卡片
- [ ] 点击选择模板
- [ ] 输入讨论标题和材料
- [ ] 上传文件
- [ ] 创建讨论并跳转

### 讨论处理流程
- [ ] 讨论状态显示为"处理中"
- [ ] 提示预计耗时3-5分钟
- [ ] 后台任务队列处理讨论
- [ ] 执行4轮讨论（澄清、质疑、反驳、裁决）
- [ ] 生成完整报告数据
- [ ] 讨论状态更新为"已完成"
- [ ] 发送飞书通知（如果配置）

### 报告展示
- [ ] 显示裁决结论和状态标签
- [ ] 显示行动清单（带优先级）
- [ ] 显示风险清单（按优先级排序）
- [ ] 显示讨论过程（可折叠）
- [ ] 显示假设说明（可折叠）
- [ ] 显示决策依据（可折叠）
- [ ] 所有角色发言正确展示

### 任务创建集成
- [ ] 每个行动项显示"创建任务"按钮
- [ ] 点击后调用API创建任务
- [ ] 任务包含正确的标题、DOD、截止时间
- [ ] 自动创建或关联负责人
- [ ] 创建后按钮变为"已创建任务"
- [ ] 可以跳转到任务详情

## 文件处理验收 ✓

- [ ] 支持PDF文件上传
- [ ] 支持PNG/JPG/JPEG图片上传
- [ ] 文件大小限制10MB生效
- [ ] 最多5个文件限制生效
- [ ] OpenAI Vision正确提取文字
- [ ] 表格转换为Markdown格式
- [ ] 提取的文本追加到材料中
- [ ] 文件存储在正确的目录

## 性能验收 ✓

- [ ] 讨论处理时间 < 5分钟
- [ ] 模板自动选择准确率 > 70%
- [ ] 文件上传速度正常
- [ ] 页面加载速度 < 2秒
- [ ] 讨论列表分页正常（20条/页）
- [ ] 详情页自动刷新（5秒间隔）

## 数据隔离验收 ✓

- [ ] 圆桌会议数据不影响任务系统数据
- [ ] 圆桌会议数据不影响洞察系统数据
- [ ] 所有表使用 roundtable_ 前缀
- [ ] 可以独立删除圆桌会议数据

## 错误处理验收 ✓

- [ ] API Key未配置时显示友好错误
- [ ] 文件上传失败显示错误信息
- [ ] 讨论处理失败显示错误信息
- [ ] 网络错误时显示重试选项
- [ ] 权限错误时跳转登录

## 用户体验验收 ✓

- [ ] 首页卡片点击进入圆桌会议
- [ ] 空状态提示清晰
- [ ] 加载状态显示正确
- [ ] 按钮禁用状态正确
- [ ] 表单验证友好
- [ ] 移动端适配正常

## 集成验收 ✓

- [ ] 飞书通知发送成功（如果配置）
- [ ] 消息卡片格式正确
- [ ] 包含讨论链接
- [ ] 显示关键指标（行动项、风险项）
- [ ] 任务创建后显示在任务列表

## 文档验收 ✓

- [ ] README包含圆桌会议说明
- [ ] 部署脚本可正常执行
- [ ] 验收清单完整
- [ ] 设计文档完整
- [ ] 实施计划完整

---

## 验收标准

- 所有核心功能正常工作
- 无阻塞性Bug
- 性能指标达标
- 数据隔离有效
- 用户体验流畅

## 已知限制

- PDF导出功能未实现（占位符）
- 手动发送到飞书功能未实现（占位符）
- 模板编辑界面未实现
- 讨论历史对比未实现
- 实时进度展示未实现（WebSocket）

## 后续优化建议

见实施计划中的"后续优化建议"部分
```

**Step 2: 提交**

```bash
git add docs/roundtable-acceptance.md
git commit -m "docs: add comprehensive acceptance checklist

- Database, API, functionality verification
- Performance and data isolation checks
- Error handling and UX verification
- Integration testing checklist
- Known limitations and future improvements"
```

---

### Task 16: 最终提交和标记

**Step 1: 最终测试运行**

```bash
# 1. 部署
./scripts/deploy-roundtable.sh

# 2. 启动服务
npm run dev

# 3. 手动测试核心流程
# - 快速开始
# - 选择模板
# - 文件上传
# - 讨论处理
# - 报告查看
# - 任务创建
```

**Step 2: 创建功能总结提交**

```bash
git add .
git commit -m "feat(roundtable): complete roundtable discussion feature

Phase 1: Database Schema
- Add 9 tables with roundtable_ prefix for data isolation
- Initialize 10 predefined templates with roles

Phase 2: Core Services
- File processor with OpenAI Vision for OCR
- Discussion engine with 4-round AI flow
- Background task queue for async processing

Phase 3: API Routes
- Template management APIs
- Discussion CRUD APIs
- Auto template selection API
- Task creation integration API

Phase 4: Frontend UI
- Homepage card integration
- Discussion list page
- Template selector component
- Material input with file upload
- Multi-step creation wizard
- Comprehensive report display

Phase 5: System Integration
- Task creation from action items
- Assignee auto-creation
- Feishu notification (auto)

Phase 6: Testing & Deployment
- Deployment script
- Acceptance checklist
- Documentation updates

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 实施完成总结

### 已完成功能

✅ **数据层**：9个独立表，10个预置模板，完全数据隔离
✅ **服务层**：文件处理、AI讨论引擎、任务队列
✅ **API层**：8个完整的REST API端点
✅ **前端**：5个页面，4个组件，完整的用户流程
✅ **集成**：任务创建、飞书通知（自动）
✅ **文档**：README、部署脚本、验收清单

### 未完成功能（占位符）

⏳ **PDF导出**：需要额外的PDF生成库
⏳ **手动发送飞书**：需要群组选择UI
⏳ **模板编辑**：需要管理界面
⏳ **实时进度**：需要WebSocket实现

### 工作量统计

- **数据库**：2个任务 - 3天
- **核心服务**：3个任务 - 4天
- **API路由**：2个任务 - 3天
- **前端界面**：4个任务 - 5天
- **系统集成**：2个任务 - 2天
- **测试文档**：3个任务 - 1天

**总计**：16个任务，18天

### 关键里程碑

Day 3: ✅ 数据库和模板初始化
Day 7: ✅ AI引擎和任务队列
Day 10: ✅ API路由完成
Day 15: ✅ 前端界面完成
Day 17: ✅ 集成和测试完成
Day 18: ✅ 部署就绪

---

## 执行选项

计划完成！现在有两个执行选项：

**1. Subagent-Driven (当前会话)** - 我在当前会话中逐任务派发子代理，每个任务完成后review，快速迭代

**2. Parallel Session (新会话)** - 您在独立会话中打开executing-plans skill，批量执行并在检查点review

**您希望选择哪种方式？**
