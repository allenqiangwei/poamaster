import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOpenAIClient } from '@/lib/openai';
import { sendFeishuTextMessage } from '@/lib/feishu';
import { DIMENSION_LABELS } from '@/lib/pulse/constants';

// POST /api/pulse/projects/:id/summary
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // 获取项目和所有条目
    const project = await prisma.pulseProject.findUnique({
      where: { id: projectId },
      include: {
        entries: {
          where: {
            deletedAt: null
          },
          orderBy: {
            updatedAt: 'desc'
          }
        }
      }
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    if (project.entries.length === 0) {
      return NextResponse.json(
        { success: false, error: '项目暂无条目，无法生成总结' },
        { status: 400 }
      );
    }

    // 构建项目状态数据
    const entriesByDimension: Record<string, any[]> = {};
    for (const entry of project.entries) {
      if (!entriesByDimension[entry.dimension]) {
        entriesByDimension[entry.dimension] = [];
      }
      entriesByDimension[entry.dimension].push({
        title: entry.title,
        evidence: entry.evidenceCurrent,
        source: entry.sourceCurrent
      });
    }

    // 生成 AI 总结
    console.log('[Summary] Generating AI summary for project:', project.name);
    const client = await getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `你是一个专业的项目管理助手，负责总结项目状态。请用简洁、专业的语言生成项目总结报告。`
        },
        {
          role: 'user',
          content: `请为以下项目生成一份简洁的状态总结报告：

项目名称：${project.name}
最后更新：${project.updatedAt.toISOString().split('T')[0]}

项目各维度状态：
${Object.entries(entriesByDimension).map(([dim, entries]) => {
  const label = DIMENSION_LABELS[dim as keyof typeof DIMENSION_LABELS] || dim;
  return `\n## ${label}\n${entries.map(e => `- ${e.title}: ${e.evidence}`).join('\n')}`;
}).join('\n')}

请生成一份包含以下内容的总结报告：
1. 项目整体健康度评估
2. 关键风险和阻塞项（如果有）
3. 需要决策或支持的事项（如果有）
4. 进度和交付物状态概述
5. 建议的下一步行动

使用清晰的 Markdown 格式，适合在飞书消息中阅读。`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const summary = response.choices[0]?.message?.content || '';

    if (!summary) {
      return NextResponse.json(
        { success: false, error: 'AI 生成总结失败' },
        { status: 500 }
      );
    }

    console.log('[Summary] AI summary generated, length:', summary.length);

    // 发送到飞书
    try {
      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const feishuMessage = `📊 **${project.name} - 项目状态总结**\n\n${summary}\n\n────────────────────\n生成时间：${timestamp}\n💡 通过 POA Master 自动生成`;

      await sendFeishuTextMessage(feishuMessage);
      console.log('[Summary] Successfully sent to Feishu');
    } catch (feishuError) {
      console.error('[Summary] Failed to send to Feishu:', feishuError);
      // 发送失败但总结已生成，返回部分成功
      return NextResponse.json({
        success: true,
        data: {
          summary,
          sent: false,
          message: 'AI 总结生成成功，但发送到飞书失败。请检查飞书配置'
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        summary,
        sent: true,
        message: 'AI 总结已生成并发送到飞书'
      }
    });
  } catch (error) {
    console.error('[Summary] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
