-- 游戏公司中台部门模板

-- 1. 游戏公司中台部门汇报审核模版
INSERT INTO "RoundtableTemplate" (
  "id",
  "name",
  "description",
  "scenario",
  "enabled",
  "usageCount",
  "keywords",
  "priority",
  "enabledRounds",
  "riskChecklist",
  "outputRequirements",
  "createdAt",
  "updatedAt"
) VALUES (
  'game-platform-report-' || gen_random_uuid()::text,
  '游戏公司中台部门汇报审核',
  '用于审核游戏公司中台部门的定期工作汇报，包括技术进展、产品迭代、运营数据等方面',
  '## 适用场景
本模板适用于游戏公司中台部门（技术中台、数据中台、运营中台等）的定期工作汇报审核。

## 审核重点
1. **技术进展**：基础设施、服务稳定性、技术债务
2. **产品迭代**：功能上线、用户反馈、产品规划
3. **运营数据**：核心指标、成本优化、资源利用率
4. **风险识别**：技术风险、业务风险、资源瓶颈

## 预期输出
- 工作亮点和问题识别
- 改进建议和行动计划
- 风险预警和应对措施',
  true,
  0,
  '["汇报", "工作汇报", "中台", "定期汇报", "周报", "月报", "季报"]'::jsonb,
  10,
  '["clarify", "question", "rebuttal", "verdict"]'::jsonb,
  '[
    "技术稳定性和可用性",
    "成本效益和资源利用",
    "技术债务累积",
    "跨部门协作问题",
    "数据安全和合规",
    "人员配置和能力缺口"
  ]'::jsonb,
  '{
    "require_actions": true,
    "require_risks": true,
    "require_timeline": true,
    "action_categories": ["技术改进", "产品优化", "运营提效", "风险应对"]
  }'::jsonb,
  NOW(),
  NOW()
);

-- 获取刚创建的模板ID（用于创建角色）
-- 注意：由于我们使用了 gen_random_uuid()，我们需要用子查询来获取ID

-- 创建汇报审核模板的角色
INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '技术负责人',
  '审核技术架构、系统稳定性、技术债务和基础设施建设情况',
  '技术架构合理性、系统稳定性指标、技术债务评估、基础设施成本、技术团队效能',
  1,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门汇报审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '产品负责人',
  '评估产品迭代进度、功能质量、用户反馈和产品规划的合理性',
  '产品迭代进度、功能完成质量、用户满意度、产品路线图、需求优先级',
  2,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门汇报审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '运营负责人',
  '审核运营数据、成本效益、资源利用率和业务支撑能力',
  '核心运营指标、成本控制、资源利用率、SLA达成率、业务支撑满意度',
  3,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门汇报审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  'CTO（主持人）',
  '综合评估中台部门整体表现，识别关键问题和风险，提出战略性改进建议',
  '战略目标达成、组织效能、技术竞争力、风险控制、跨部门协作',
  4,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门汇报审核';

-- 2. 游戏公司中台部门提案审核模版
INSERT INTO "RoundtableTemplate" (
  "id",
  "name",
  "description",
  "scenario",
  "enabled",
  "usageCount",
  "keywords",
  "priority",
  "enabledRounds",
  "riskChecklist",
  "outputRequirements",
  "createdAt",
  "updatedAt"
) VALUES (
  'game-platform-proposal-' || gen_random_uuid()::text,
  '游戏公司中台部门提案审核',
  '用于审核游戏公司中台部门的新项目提案、架构升级、技术方案等重大决策',
  '## 适用场景
本模板适用于游戏公司中台部门提出的新项目提案、技术架构升级、工具平台建设等需要公司层面审核的重大决策。

## 审核重点
1. **技术可行性**：技术方案、架构设计、实施风险
2. **业务价值**：业务收益、ROI分析、优先级评估
3. **资源投入**：人力成本、时间周期、预算规划
4. **风险评估**：技术风险、业务风险、机会成本

## 预期输出
- 提案可行性评估
- 通过/有条件通过/打回决策
- 详细的行动计划和里程碑
- 风险清单和应对措施',
  true,
  0,
  '["提案", "立项", "新项目", "架构升级", "技术方案", "中台建设", "工具平台"]'::jsonb,
  20,
  '["clarify", "question", "rebuttal", "verdict"]'::jsonb,
  '[
    "技术可行性和复杂度",
    "投入产出比和ROI",
    "资源和人力配置",
    "项目周期和交付风险",
    "对现有系统的影响",
    "技术选型和维护成本",
    "团队能力匹配度"
  ]'::jsonb,
  '{
    "require_actions": true,
    "require_risks": true,
    "require_timeline": true,
    "require_budget": true,
    "action_categories": ["立项准备", "技术方案", "资源协调", "风险预案"],
    "decision_types": ["pass", "conditional_pass", "reject", "need_more_info"]
  }'::jsonb,
  NOW(),
  NOW()
);

-- 创建提案审核模板的角色
INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '技术架构师',
  '评估技术方案的合理性、可行性和潜在技术风险，审核架构设计和技术选型',
  '技术架构合理性、技术选型适配度、实施复杂度、技术债务风险、可扩展性、可维护性',
  1,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门提案审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '产品经理',
  '评估业务价值、用户需求匹配度和产品竞争力提升',
  '业务价值、用户需求、产品规划、功能优先级、市场竞争力',
  2,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门提案审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '运营分析师',
  '分析运营数据支撑、成本效益和资源利用效率',
  '数据分析能力、成本效益比、运营效率提升、资源利用率、监控告警体系',
  3,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门提案审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  '财务审计',
  '审核预算合理性、ROI预期和财务风险',
  '预算规划、成本估算、投资回报率、财务风险、现金流影响',
  4,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门提案审核';

INSERT INTO "RoundtableRole" ("id", "templateId", "name", "responsibility", "focusAreas", "order", "createdAt")
SELECT
  'role-' || gen_random_uuid()::text,
  t.id,
  'CEO（主持人）',
  '综合各方意见，做出最终决策，确保提案符合公司战略方向',
  '战略契合度、资源配置合理性、组织能力、市场时机、风险控制',
  5,
  NOW()
FROM "RoundtableTemplate" t
WHERE t.name = '游戏公司中台部门提案审核';
