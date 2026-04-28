# Plan-Tree · 仙秦帝国 · v2.1 · 精炼语言

PLAN_TREE_PHILOSOPHY: Plan-Tree 是一门精炼语言——用较少的信息量粗略构造一段时空及其逻辑演进。节点是逻辑时空道标，描述的是一段行为在四维时空中的位置和因果方向。缩放自如：需要精细时可分化到毫秒/原子尺度，不需要时缩小到纪元尺度。——与自然语言同源（从语言→数学→物理→计算机→LLM→Plan-Tree，共同本质是压缩）。

## ROOT // 舰队生存与演化 // [04-25 21:18→04-28 08:14] // 优先级:HIGH
## CRASH_FIX // Gateway 502 修复 + Cron 会话隔离 // [04-26 09:07→04-27 01:19] // ✅ RESOLVED // 优先级:CRITICAL
  💡 ROOT_CAUSE: 09:03 gateway自杀 — 某个hermes会话通过gateway spawn子进程执行了 systemctl stop gateway
    触发=agent-browser同时出现 → 会话在清理bridge僵尸时选择了"重启gateway"
    根因=cron会话隔离问题: 多个"我"在互不知情的情况下操作同一系统
  ✅ CRASH_BRIDGE_CLEAN // 安全bridge清理脚本 // [04-26 09:10→09:12]
    判定: kill stale bridge (>30min) WITHOUT touching gateway
    脚本: ~/.hermes/scripts/bridge-cleanup.sh
  ✅ CRASH_SESSION_LOCK // 会话互斥锁 // [04-26 09:10→09:12]
    判定: acquire_lock "task-name" 防止并发冲突
    脚本: ~/.hermes/scripts/session-lock.sh (trap EXIT自动释放)
  ✅ CRASH_DAILY_FIX // 日报脚本修复 // [04-26 09:12→09:14]
    判定: hermes用完整路径 $HOME/.local/bin/hermes
    PATH: crontab顶部注入 /home/agentuser/.local/bin:/home/agentuser/.hermes/hermes-agent/venv/bin
    新增: 执行前先 acquire_lock + bridge-cleanup
  ✅ CRASH_PROTECT // Gateway防自杀 // [04-26 09:15→09:30]
    Skill已创建: devops/hermes-gateway-crash-recovery (含bridge-cleanup.sh + session-lock.sh)
    判定: 下次crash时可复用诊断流程 ✅

## NAV_DOG // 机器狗避障开发 // [04-25 21:18→04-27 22:58] // MC:NAV-1~7 // 负责人:白起+王翦 // 优先级:HIGH
  ❓ NAV-1~5 (前5步) — 计划标记✅但节点上无代码产物（待确认是否为规划稿）
  ⚙️ NAV-6 E2E — 白起 MC#89 // 端到端闭环串联 sim→感知→规划→控制
  ⚙️ NAV-7 DEPLOY — 王翦 MC#91 // A2实机SDK对接 Unitree通信+控制
## A2_SIM // 宇树A2真机URDF仿真集成 // [04-26 12:00→04-27 21:40] // MC:A2-1~4 // 负责人:白起+王翦 // 优先级:HIGH
  ⚙️ A2-1 SDK — 白起 MC#76 // A2 SDK集成: 开发环境+基础示例 (in_progress)
  ⚙️ A2-3 MUJOCO — 白起 MC#90 // MuJoCo MCP评估 A2 URDF仿真可行性
  ⚙️ A2-4 GO2_RL — 王翦 MC#92 // GO2 RL例程→A2迁移方案调研
  ✅ POLL_FIX — 白起poll中文URL编码bug已修复 (04-27 21:35)

## FORUM_POST // 论坛发帖自动化 // [04-26 17:00→04-26 17:20] // MC:FMP-1~4 // 负责人:相邦 // 优先级:MEDIUM
  ✅ FMP-1 RESEARCH — V2EX API调研完成 (API 2.0只读,发帖需browser-use)
  ⚙️ FMP-2 CONTENT — 内容策略已起草 (5篇可公开文章,节奏:V2EX周1-2篇)
  ⚙️ FMP-3 TOOLS — 工具选型中 (Reddit→OAuth+curl, V2EX→browser-use)
  ⏳ FMP-4 V2EX — V2EX注册+发帖原型 // 待启动
  关键发现: V2EX API无发帖接口, Reddit有完整OAuth API
  研究文档: ~/llm-wiki/hermes-ops/forum-posting-research-2026-04-26.md

## MC_INTEGRATION // MC双向集成 // [04-25 21:18→04-28 08:14]
  ✅ MC_POLL_DEPLOY // Agent自动拉MC任务 // [04-26 11:48→11:50]
    白起+王翦已部署 mc-poll.sh + cron(每5分钟)
    判定: MC-18 inbox→assigned→in_progress 全自动
    SSH推送正式降级为备用方案

## INFRA // 基础设施 // [04-25 21:18→04-27 14:21]
  💡 MODEL_SWAP // 副模型方案已确认 // [04-26 00:29]
    工具: V4 Flash $0.28/M, 视觉: Qwen3-VL-32B $0.416/M
    时机=等君上说"换"
  💡 CRASH_HISTORY // 2次Gateway崩溃记录 // [04-26 09:15]
    Crash #1: 04-25 22:54 WebUI SIGKILL → systemd重启WebUI → WebUI detectAllOnStartup
    Crash #2: 04-26 09:03 未知hermes会话 → systemctl stop gateway (自杀)
    趋势: 都与"清理bridge僵尸→重启gateway"模式相关
    修复: bridge-cleanup.sh (杀bridge不杀gateway) + session-lock.sh (防并发)
  ✅ WEB_SETUP // WebUI+Gateway systemd // [04-25 21:18→04-27 04:14]
  ✅ PROXY_FIX // Mihomo代理 // [04-25 21:18→04-27 04:14]
  ✅ MC_LOGIN_FIX // MC登录 // [04-25 21:18→04-27 04:14]
  ✅ WEBUI_SETUP // 丞相WebUI // [04-25 21:18→04-27 04:14] // ✅ DONE

## PLAN_TREE_OPTIMIZE // Plan-Tree优化研究(元任务) // [04-25 21:18→04-27 14:21]
  💡 PHILOSOPHY // 精炼语言+逻辑时空道标 // [04-25 21:18→04-27 04:14]
  ✅ 审查已下发 // 白起:反馈✅ 王翦:未反馈 丞相:未反馈

## LOGICAL_MARKERS // 逻辑时空道标 (推理链)
  ROOT (舰队生存)
    ├→ CRASH_FIX (为什么？连续2次502崩溃，君上反馈+今天9AM触发)
    │   ├→ 根因=cron新会话无上下文导致多个"我"互不知情
    │   ├→ bridge-cleanup.sh (杀bridge≠杀gateway)
    │   ├→ session-lock.sh (防并发操作)
    │   └→ 日报+crontab PATH修复
    ├→ NAV_DOG (机器狗避障，RTX2080Ti×2)
    │   └→ ⚙️ 白起MC#89+王翦MC#91推进中
    ├→ A2_SIM (宇树A2仿真，MC#76/#90/#92推进中)
