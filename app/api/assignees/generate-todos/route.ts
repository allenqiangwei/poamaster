import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { getOpenAIClient } from '@/lib/openai';
import { DIMENSION_LABELS } from '@/lib/insights/constants';

/**
 * POST /api/assignees/generate-todos
 * 基于所有负责人的洞察和任务生成待办事项建议
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

    // 获取所有负责人及其关联数据
    const assignees = await prisma.assignee.findMany({
      include: {
        confirmedItems: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 20 // 每个负责人最多取20条洞察
        },
        tasks: {
          where: {
            status: { in: ['TODO', 'IN_PROGRESS'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 10 // 每个负责人最多取10个未完成任务
        },
        _count: {
          select: {
            confirmedItems: true,
            tasks: true
          }
        }
      }
    });

    if (assignees.length === 0) {
      return NextResponse.json(
        { success: false, error: '暂无负责人数据' },
        { status: 400 }
      );
    }

    // 构建分析摘要
    let analysisSummary = '【负责人概况】\n';
    analysisSummary += `总负责人数: ${assignees.length}\n\n`;

    assignees.forEach((assignee, index) => {
      analysisSummary += `${index + 1}. ${assignee.name}\n`;
      analysisSummary += `   - 洞察总数: ${assignee._count.confirmedItems} 条\n`;
      analysisSummary += `   - 未完成任务: ${assignee._count.tasks} 个\n`;

      // 最近的洞察（按维度分组）
      if (assignee.confirmedItems.length > 0) {
        const insightsByDim: Record<string, string[]> = {};
        assignee.confirmedItems.forEach((item) => {
          if (!insightsByDim[item.dimension]) {
            insightsByDim[item.dimension] = [];
          }
          if (insightsByDim[item.dimension].length < 3) {
            insightsByDim[item.dimension].push(item.content);
          }
        });

        analysisSummary += `   - 最近洞察:\n`;
        Object.entries(insightsByDim).forEach(([dim, items]) => {
          const label = DIMENSION_LABELS[dim] || dim;
          analysisSummary += `     【${label}】\n`;
          items.forEach((content) => {
            analysisSummary += `       · ${content.substring(0, 80)}${content.length > 80 ? '...' : ''}\n`;
          });
        });
      }

      // 未完成的任务
      if (assignee.tasks.length > 0) {
        analysisSummary += `   - 未完成任务:\n`;
        assignee.tasks.slice(0, 5).forEach((task) => {
          const status = task.status === 'TODO' ? '待办' : '进行中';
          analysisSummary += `     · [${status}] ${task.title}\n`;
        });
      }

      analysisSummary += '\n';
    });

    // 使用 OpenAI 生成待办事项建议
    const prompt = `你是一位经验丰富的 COO 助手，帮助 COO 管理团队。

以下是当前所有负责人的情况：
${analysisSummary}

请基于以上信息，生成 COO 需要执行的待办事项（To-Do List）。

分析要点：
1. **关注负责人的状态**：
   - 哪些负责人有很多洞察但没有对应的行动任务？
   - 哪些负责人有风险、障碍、决策点需要 COO 介入？
   - 哪些负责人的任务进展可能需要跟进？

2. **生成具体的待办事项**：
   - 每个待办事项要清晰、可执行
   - 明确是针对哪个负责人
   - 说明为什么需要做这件事
   - 如果可能，建议截止时间

3. **输出格式**（必须返回 JSON 对象，包含 todos 数组）：
\`\`\`json
{
  "todos": [
    {
      "title": "待办事项标题（含负责人姓名）",
      "dod": "完成标准",
      "dueDate": "YYYY-MM-DD"
    }
  ]
}
\`\`\`

注意：
- 必须返回一个包含 "todos" 数组的 JSON 对象
- title 应该简短明确（建议30字以内），并包含相关负责人的名字
- dod 要具体描述如何判断任务完成
- dueDate 可选，格式必须是 YYYY-MM-DD，如果不确定就不要设置
- 生成 3-8 个待办事项，聚焦最重要的管理行动
- 待办事项应该是 COO 本人需要做的事，而不是分配给负责人的任务`;

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

    console.log('[Assignees Generate Todos] AI raw response:', content);

    let todos;
    try {
      const parsed = JSON.parse(content);
      console.log('[Assignees Generate Todos] Parsed response:', parsed);

      todos = Array.isArray(parsed) ? parsed : (parsed.todos || parsed.tasks || []);

      console.log('[Assignees Generate Todos] Extracted todos:', todos);
    } catch (parseError) {
      console.error('[Assignees Generate Todos] Failed to parse AI response:', parseError);
      console.error('[Assignees Generate Todos] Raw content:', content);
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
        assigneeCount: assignees.length,
        totalInsights: assignees.reduce((sum, a) => sum + a._count.confirmedItems, 0),
        totalTasks: assignees.reduce((sum, a) => sum + a._count.tasks, 0)
      }
    });
  } catch (error) {
    console.error('[Assignees Generate Todos] Error:', error);

    if (error instanceof Error) {
      console.error('[Assignees Generate Todos] Error message:', error.message);
      console.error('[Assignees Generate Todos] Error stack:', error.stack);
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
        message = `生成失败: ${error.message}`;
      }
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
