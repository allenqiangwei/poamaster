import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { sendFeishuMessage } from '@/lib/feishu';
import { getConfig } from '@/lib/config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // 获取讨论详情
    const discussion = await prisma.roundtableDiscussion.findUnique({
      where: { id },
      include: {
        template: true,
        actions: {
          orderBy: { priority: 'desc' },
        },
        risks: {
          where: { priority: 'high' },
          orderBy: { priority: 'desc' },
        },
      },
    });

    if (!discussion) {
      return NextResponse.json({ error: 'Discussion not found' }, { status: 404 });
    }

    if (discussion.status !== 'completed') {
      return NextResponse.json(
        { error: '讨论尚未完成，无法发送' },
        { status: 400 }
      );
    }

    // 获取飞书群聊 ID
    const chatId = await getConfig('feishu.chatId');
    if (!chatId) {
      return NextResponse.json(
        { error: '未配置飞书群聊 ID，请在设置中配置' },
        { status: 400 }
      );
    }

    // 构建飞书消息卡片
    const conclusionLabel = {
      pass: '✅ 通过',
      conditional_pass: '⚠️ 有条件通过',
      reject: '❌ 打回',
      need_more_info: '📋 需补充信息',
    }[discussion.conclusionType || 'unknown'] || discussion.conclusionType;

    const card = {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: 'plain_text',
          content: `📊 圆桌会议结论：${discussion.title}`,
        },
        template: discussion.conclusionType === 'pass' ? 'green' :
                  discussion.conclusionType === 'reject' ? 'red' : 'orange',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**裁决结论**\n${conclusionLabel}\n\n${discussion.conclusion || '无'}`,
          },
        },
        {
          tag: 'hr',
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**行动清单** (${discussion.actions?.length || 0}项)`,
          },
        },
        ...((discussion.actions || []).slice(0, 5).map((action: any) => ({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `${action.priority === 'high' ? '🔴' : action.priority === 'medium' ? '🟡' : '🟢'} ${action.content}`,
          },
        }))),
        ...(discussion.actions && discussion.actions.length > 5 ? [{
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `_还有 ${discussion.actions.length - 5} 项..._`,
          },
        }] : []),
        {
          tag: 'hr',
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**高风险项** (${discussion.risks?.length || 0}项)`,
          },
        },
        ...((discussion.risks || []).slice(0, 3).map((risk: any) => ({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `⚠️ ${risk.description}\n_影响：${risk.impact}_`,
          },
        }))),
        {
          tag: 'hr',
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `📅 ${new Date(discussion.createdAt).toLocaleString('zh-CN')}\n🤖 模板：${discussion.template?.name || '未知'}`,
          },
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: '查看完整报告',
              },
              type: 'default',
              url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3030'}/roundtable/discussions/${discussion.id}`,
            },
          ],
        },
      ],
    };

    // 使用飞书 API 发送消息
    await sendFeishuMessage(chatId, card);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send to Feishu error:', error);

    let message = '发送失败，请稍后重试';
    if (error instanceof Error) {
      if (error.message.includes('飞书配置不完整')) {
        message = '飞书配置不完整，请在设置中配置 App ID 和 App Secret';
      } else if (error.message.includes('Connection error') ||
                 error.message.includes('ECONNRESET') ||
                 error.message.includes('fetch failed')) {
        message = '网络连接失败。请检查网络连接、代理设置，或稍后重试';
      } else if (error.message.includes('timeout') ||
                 error.message.includes('timed out')) {
        message = '请求超时。请稍后重试或检查网络连接';
      } else if (error.message) {
        message = error.message;
      }
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
