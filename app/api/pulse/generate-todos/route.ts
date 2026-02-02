import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient } from '@/lib/openai';
import { STALE_THRESHOLD_DAYS, DIMENSION_LABELS } from '@/lib/pulse/constants';

/**
 * POST /api/pulse/generate-todos
 * 基于所有项目的状态生成待办事项建议
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '会话无效' },
        { status: 401 }
      );
    }

    // 获取所有项目及其统计信息
    const projects = await prisma.pulseProject.findMany({
      include: {
        entries: {
          where: { deletedAt: null }
        },
        _count: {
          select: { entries: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (projects.length === 0) {
      return NextResponse.json(
        { success: false, error: '暂无项目数据' },
        { status: 400 }
      );
    }

    // 分析每个项目的状态
    const projectAnalysis = projects.map((project) => {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(project.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const isStale = daysSinceUpdate > STALE_THRESHOLD_DAYS;

      // 按维度统计
      const byDimension: Record<string, number> = {};
      project.entries.forEach((entry) => {
        byDimension[entry.dimension] = (byDimension[entry.dimension] || 0) + 1;
      });

      return {
        name: project.name,
        daysSinceUpdate,
        isStale,
        totalEntries: project._count.entries,
        byDimension,
        lastUpdate: new Date(project.updatedAt).toLocaleDateString('zh-CN')
      };
    });

    // 构建分析摘要
    let analysisSummary = '【项目概况】\n';
    analysisSummary += `总项目数: ${projects.length}\n`;
    analysisSummary += `停滞项目数: ${projectAnalysis.filter(p => p.isStale).length}\n\n`;

    analysisSummary += '【各项目详情】\n';
    projectAnalysis.forEach((proj, index) => {
      analysisSummary += `${index + 1}. ${proj.name}\n`;
      analysisSummary += `   - 最后更新: ${proj.lastUpdate} (${proj.daysSinceUpdate}天前)\n`;
      if (proj.isStale) {
        analysisSummary += `   - ⚠️ 已停滞 (超过${STALE_THRESHOLD_DAYS}天未更新)\n`;
      }
      analysisSummary += `   - 总条目数: ${proj.totalEntries}\n`;
      analysisSummary += `   - 维度分布:\n`;
      Object.entries(proj.byDimension).forEach(([dim, count]) => {
        analysisSummary += `     · ${DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS] || dim}: ${count}\n`;
      });
      analysisSummary += '\n';
    });

    // 使用 OpenAI 生成待办事项建议
    const prompt = `你是一位经验丰富的 COO 助手，帮助 COO 管理多个项目。

以下是当前所有项目的状态：
${analysisSummary}

请基于以上信息，生成 COO 需要执行的待办事项（To-Do List）。

要求：
1. **识别关键问题**：
   - 停滞的项目需要跟进
   - 维度分布不均衡需要补充
   - 长期未更新需要催促

2. **生成具体的待办事项**：
   - 每个待办事项要清晰、可执行
   - 包含项目名称
   - 说明为什么需要做这件事
   - 如果可能，建议截止时间

3. **输出格式**（必须返回 JSON 对象，包含 todos 数组）：
\`\`\`json
{
  "todos": [
    {
      "title": "待办事项标题",
      "dod": "完成标准",
      "dueDate": "YYYY-MM-DD"
    }
  ]
}
\`\`\`

注意：
- 必须返回一个包含 "todos" 数组的 JSON 对象
- title 应该简短明确（建议30字以内）
- dod 要具体描述如何判断任务完成
- dueDate 可选，格式必须是 YYYY-MM-DD，如果不确定就不要设置
- 生成 3-8 个待办事项，聚焦最重要的行动`;

    const openai = await getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || '{}';

    console.log('[Generate Todos] AI raw response:', content);

    let todos;
    try {
      const parsed = JSON.parse(content);
      console.log('[Generate Todos] Parsed response:', parsed);

      // Handle both direct array and object with array property
      todos = Array.isArray(parsed) ? parsed : (parsed.todos || parsed.tasks || []);

      console.log('[Generate Todos] Extracted todos:', todos);
    } catch (parseError) {
      console.error('[Generate Todos] Failed to parse AI response:', parseError);
      console.error('[Generate Todos] Raw content:', content);
      return NextResponse.json(
        { success: false, error: 'AI 返回格式错误' },
        { status: 500 }
      );
    }

    if (!Array.isArray(todos) || todos.length === 0) {
      return NextResponse.json(
        { success: false, error: '未能生成待办事项' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        todos,
        projectCount: projects.length,
        staleCount: projectAnalysis.filter(p => p.isStale).length
      }
    });
  } catch (error) {
    console.error('[Generate Todos] Error:', error);

    if (error instanceof Error) {
      console.error('[Generate Todos] Error message:', error.message);
      console.error('[Generate Todos] Error stack:', error.stack);
    }

    let message = '生成失败，请稍后重试';

    if (error instanceof Error) {
      if (error.message.includes('Connection error') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('fetch failed')) {
        message = '网络连接失败。请检查网络连接、代理设置，或稍后重试';
      } else if (error.message.includes('timeout') ||
                 error.message.includes('timed out')) {
        message = '请求超时。请稍后重试或检查网络连接';
      } else {
        // Include error message in development
        message = `生成失败: ${error.message}`;
      }
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
