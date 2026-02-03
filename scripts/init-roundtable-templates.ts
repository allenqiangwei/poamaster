import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    name: '项目/版本立项提案',
    description: '评估新项目或版本的立项申请，从产品、技术、财务、法务多角度审查可行性',
    scenario: '适用于新产品立项、重大版本规划、功能模块评估等场景',
    keywords: ['立项', '新项目', '项目提案', '版本规划', '功能规划'],
    priority: 10,
    roles: [
      { name: '产品经理', responsibility: '评估产品价值和市场需求', focusAreas: '用户需求、市场竞争、产品定位、功能优先级', order: 1 },
      { name: '技术架构师', responsibility: '评估技术可行性和架构设计', focusAreas: '技术难度、架构设计、技术债务、开发周期', order: 2 },
      { name: '财务官', responsibility: '评估财务可行性和投资回报', focusAreas: '成本预算、收入预测、ROI、现金流影响', order: 3 },
      { name: '法务官', responsibility: '识别法律风险和合规要求', focusAreas: '知识产权、合规性、合同风险、法律责任', order: 4 },
    ]
  },
  {
    name: '经营数据复盘',
    description: '分析经营数据表现，识别问题和机会，制定改进计划',
    scenario: '适用于月度/季度经营分析、业绩复盘、运营效率评估等场景',
    keywords: ['复盘', '经营数据', '业绩分析', '财报', '运营分析'],
    priority: 9,
    roles: [
      { name: 'CFO', responsibility: '分析财务数据和经营指标', focusAreas: '收入、成本、利润、现金流、财务健康度', order: 1 },
      { name: '运营总监', responsibility: '评估运营效率和执行情况', focusAreas: '运营指标、流程效率、团队产能、资源利用', order: 2 },
      { name: '数据分析师', responsibility: '深度挖掘数据洞察', focusAreas: '数据趋势、异常分析、相关性分析、预测模型', order: 3 },
      { name: '战略顾问', responsibility: '从战略角度解读数据', focusAreas: '战略目标达成、市场趋势、竞争态势、增长机会', order: 4 },
    ]
  },
  {
    name: '市场投放方案',
    description: '评估市场营销和广告投放方案的有效性和可行性',
    scenario: '适用于营销活动策划、广告投放计划、品牌推广方案等场景',
    keywords: ['投放', '广告', '市场推广', '获客', '营销活动'],
    priority: 8,
    roles: [
      { name: '市场总监', responsibility: '评估市场策略和执行计划', focusAreas: '目标受众、渠道选择、投放策略、执行时间表', order: 1 },
      { name: '财务官', responsibility: '控制投放成本和评估ROI', focusAreas: '预算分配、成本效益、ROI预测、财务风险', order: 2 },
      { name: '品牌经理', responsibility: '确保品牌一致性和形象', focusAreas: '品牌形象、传播内容、用户感知、品牌价值', order: 3 },
      { name: '数据分析师', responsibility: '设计衡量指标和数据追踪', focusAreas: '转化率、获客成本、数据监测、效果归因', order: 4 },
    ]
  },
  {
    name: '运营活动方案',
    description: '评估用户运营和增长活动的设计和执行方案',
    scenario: '适用于用户增长活动、促销活动、留存策略等场景',
    keywords: ['运营活动', '用户增长', '促销', '留存', '活跃度'],
    priority: 7,
    roles: [
      { name: '运营总监', responsibility: '设计活动策略和执行计划', focusAreas: '活动目标、用户分层、活动机制、执行步骤', order: 1 },
      { name: '财务官', responsibility: '评估活动成本和收益', focusAreas: '活动预算、成本控制、收益预测、投入产出比', order: 2 },
      { name: '用户增长专家', responsibility: '优化增长漏斗和转化', focusAreas: '增长模型、转化率、病毒系数、用户生命周期', order: 3 },
      { name: '风险控制官', responsibility: '识别活动风险和合规问题', focusAreas: '羊毛党、欺诈风险、合规性、负面影响', order: 4 },
    ]
  },
  {
    name: '产品功能评审',
    description: '评审新功能的设计、实现和发布方案',
    scenario: '适用于新功能上线评审、产品改进方案、用户体验优化等场景',
    keywords: ['功能评审', '产品设计', '用户体验', '功能上线'],
    priority: 6,
    roles: [
      { name: '产品经理', responsibility: '评估功能价值和优先级', focusAreas: '用户价值、功能完整性、优先级、产品路线图', order: 1 },
      { name: '用户体验设计师', responsibility: '评估交互设计和用户体验', focusAreas: '易用性、交互流程、视觉设计、用户反馈', order: 2 },
      { name: '技术负责人', responsibility: '评估技术实现和质量', focusAreas: '技术方案、代码质量、性能、可维护性', order: 3 },
      { name: '客服主管', responsibility: '评估用户支持和文档', focusAreas: '用户教育、帮助文档、常见问题、客服准备', order: 4 },
    ]
  },
  {
    name: '成本削减方案',
    description: '评估成本优化和削减方案的可行性和影响',
    scenario: '适用于成本优化、预算削减、效率提升等场景',
    keywords: ['成本削减', '降本增效', '预算优化', '成本控制'],
    priority: 5,
    roles: [
      { name: 'CFO', responsibility: '分析成本结构和削减机会', focusAreas: '成本分析、削减目标、财务影响、预算重分配', order: 1 },
      { name: '运营总监', responsibility: '评估对运营的影响', focusAreas: '运营效率、团队影响、流程调整、服务质量', order: 2 },
      { name: '采购经理', responsibility: '评估供应商和采购策略', focusAreas: '供应商谈判、采购优化、合同重签、替代方案', order: 3 },
      { name: '法务官', responsibility: '识别合同和法律风险', focusAreas: '合同条款、违约风险、法律责任、合规性', order: 4 },
    ]
  },
  {
    name: '组织架构调整',
    description: '评估组织结构变更和人员调整方案',
    scenario: '适用于组织重组、部门调整、人员优化等场景',
    keywords: ['组织架构', '部门调整', '人员优化', '组织重组'],
    priority: 4,
    roles: [
      { name: 'HR总监', responsibility: '设计组织架构和人员方案', focusAreas: '组织设计、人员配置、招聘计划、员工沟通', order: 1 },
      { name: '部门负责人', responsibility: '评估对业务的影响', focusAreas: '业务连续性、团队士气、工作交接、目标达成', order: 2 },
      { name: '财务官', responsibility: '评估人力成本和预算', focusAreas: '人力成本、预算影响、遣散费用、招聘成本', order: 3 },
      { name: '文化官', responsibility: '评估对企业文化的影响', focusAreas: '组织文化、员工体验、团队氛围、价值观传承', order: 4 },
    ]
  },
  {
    name: '战略合作评估',
    description: '评估战略合作和商务合作方案',
    scenario: '适用于合作伙伴评估、战略联盟、商务合作等场景',
    keywords: ['战略合作', '合作伙伴', '商务合作', '联盟'],
    priority: 3,
    roles: [
      { name: '战略顾问', responsibility: '评估战略价值和协同效应', focusAreas: '战略契合度、协同效应、长期价值、市场影响', order: 1 },
      { name: '法务官', responsibility: '审查合作条款和法律风险', focusAreas: '合同条款、知识产权、法律责任、争议解决', order: 2 },
      { name: '财务官', responsibility: '评估财务影响和投资回报', focusAreas: '财务条款、投资回报、成本分担、收益分配', order: 3 },
      { name: '业务负责人', responsibility: '评估业务整合和执行', focusAreas: '业务整合、执行计划、资源协调、风险控制', order: 4 },
    ]
  },
  {
    name: '危机应对方案',
    description: '评估危机应对和公关处理方案',
    scenario: '适用于危机管理、公关事件、舆情应对等场景',
    keywords: ['危机应对', '公关', '舆情', '危机管理'],
    priority: 2,
    roles: [
      { name: '危机管理专家', responsibility: '设计危机应对策略', focusAreas: '危机评估、应对策略、应急预案、资源调配', order: 1 },
      { name: '公关总监', responsibility: '管理公众沟通和媒体关系', focusAreas: '媒体沟通、公众声明、舆论引导、形象修复', order: 2 },
      { name: '法务官', responsibility: '控制法律风险和责任', focusAreas: '法律责任、合规性、诉讼风险、证据保全', order: 3 },
      { name: 'CEO助理', responsibility: '协调资源和高层决策', focusAreas: '资源协调、决策支持、内部沟通、执行监督', order: 4 },
    ]
  },
  {
    name: '年度规划审查',
    description: '审查年度战略规划和目标设定',
    scenario: '适用于年度规划、战略review、目标设定等场景',
    keywords: ['年度规划', '战略规划', 'OKR', '年度目标'],
    priority: 1,
    roles: [
      { name: '战略顾问', responsibility: '评估战略方向和目标设定', focusAreas: '战略方向、市场机会、竞争格局、目标合理性', order: 1 },
      { name: 'CFO', responsibility: '评估财务规划和资源分配', focusAreas: '财务目标、预算分配、投资计划、资源优先级', order: 2 },
      { name: '各部门负责人', responsibility: '评估执行计划和资源需求', focusAreas: '执行计划、资源需求、协同配合、风险挑战', order: 3 },
      { name: '外部顾问', responsibility: '提供独立视角和建议', focusAreas: '行业趋势、最佳实践、战略盲点、外部风险', order: 4 },
    ]
  },
];

async function main() {
  console.log('开始初始化圆桌会议模板...');

  for (const template of TEMPLATES) {
    const { roles, ...templateData } = template;

    // 创建模板
    const createdTemplate = await prisma.roundtableTemplate.create({
      data: {
        ...templateData,
        keywords: template.keywords,
        roles: {
          create: roles
        }
      }
    });

    console.log(`✓ 创建模板: ${createdTemplate.name}`);
  }

  console.log('✅ 所有模板初始化完成!');
}

main()
  .catch((e) => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
