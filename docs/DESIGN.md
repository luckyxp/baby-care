# 架构与数据同步设计

## 定位

本阶段是**纯静态托管的 H5**：没有服务器，一切能力都在浏览器内完成。为了同时满足「离线可记录、三方实时互通」这些本需要后端的诉求，前端刻意引入了一个**可替换的传输层**：

```
视图 ──▶ services ──▶ repo(本地库+离线队列) ──▶ sync engine ──▶ transport ──▶ "云"
                        │                                │
                    本地乐观落库                      推/拉 + 实时订阅
```

- 现状的「云」是 `src/cloud/`：一个同源 IndexedDB（`bc_cloud`）+ 内存服务 + `BroadcastChannel` 广播。同一浏览器的不同标签页登录不同账号，就能演示三方实时同步、邀请码、权限、消息推送。
- 未来接真实后端时，只需实现 `Transport` 接口的 `HttpTransport`（fetch + WebSocket/SSE），把 `src/sync/transport.ts` 底部导出替换即可，视图、引擎、本地库零改动。

## 关键设计决策

### 1. 本地副本 + 离线队列（local-first）

每个账号一个本地库 `bc_client_<userId>`，界面只读本地库（`useLive` → Dexie liveQuery 驱动刷新），因此：

- 打开即有数据、断网可看可记；
- 写入统一走 `repo`：权限预检 → 乐观落库 → 追加 outbox，三者同一本地事务，界面即时反馈；
- 同步引擎「先推后拉」：把 outbox 推给云端裁决，成功出队、被拒回滚到云端版本；再按 `seq > cursor` 增量拉取。

### 2. 权限：云端裁决，前端只做预检

`src/shared/policy.ts` 是唯一规则来源，前端用它做按钮置灰/预检，云端用它做最终裁决。即便绕过界面直接提交，也会被拒绝并回滚，同时填写人 `createdBy` 由云端认定，无法冒名。

| 能力 | 育儿嫂(admin) | 家长(parent) |
|---|---|---|
| 宝宝档案 / 计划 / 任务 / 汇报 | 读写 | 只读（汇报可留言） |
| 护理日志 / 备注 | 读写 | 新增；只能改删自己录入的 |
| 打卡 | 全部 | 仅晚间分配给家长的任务 |
| 成员 / 邀请码 | 管理 | 只读（邀请码不可见） |

### 3. 变更序号与增量同步

云端给每个家庭维护单调递增的 `seq`，每个实体带 `[familyId+seq]` 复合索引。`pull(cursor)` 返回 `seq > cursor` 且对调用者可见的变更。可见性规则（`VISIBLE`）保证邀请码只下发给育儿嫂、消息只下发给接收人；被移出家庭的成员下一轮同步即收到 `NO_FAMILY`，本地副本随之清除。

### 4. 幂等与确定性 ID

- 每条 Mutation 带 `mid`，云端幂等表去重，网络重试不会重复落库；
- 计划/任务用确定性 ID（`plan:<baby>:<date>` / `task:<baby>:<date>:<key>`），多设备同时生成也只会得到同一份计划；「换一批」使用新的随机 ID。

### 5. 计划与喂养去打卡

- 按月龄（`ageOf`）匹配 11 个月龄阶段方案，再以「出生天数」为种子在素材库轮换，同一天稳定、相邻两天错开；
- **喂养任务不需要单独打卡**：录入奶量/辅食/用药日志后，`matchFeeding` 按「同类型 + ±90 分钟内最近」贪心匹配到计划时点，避免重复录入；补剂按名称全天匹配。

### 6. 汇报：抓取 + 人工改写不互斥

汇报分块（喂养/睡眠/排便/健康/早教/亲子/留言/小结/交接），每块都可被育儿嫂改写（`edited`）。「刷新数据」只覆盖未改写的块，改写内容永不被系统覆盖。发布时给家长发重要消息。汇报只描述**已录入**的内容，不据缺失记录断言「宝宝正常/健康」。

## 目录与职责

```
shared/   领域契约（types/constants/policy/errors）—— 前后端共用
cloud/    模拟云（db/server/notify/demo）
sync/     transport / engine / network
db/       client(本地库) / repo(写入) / live(响应式查询)
domain/   纯逻辑：planner / stats / report / dashboard / log-kinds / voice-parser
library/  内置素材库：阶段 / 早教 / 亲子 / 食材 / 食谱
services/ 页面调用的业务操作
stores/   session / ui
composables/  useDay / useClock / useAction / useVoice / useNotices / alerts
views/    页面；components/ 公共组件
```

## 静态版的边界（务必知晓）

- 数据只保存在当前浏览器，**其他手机/浏览器/无痕窗口不会同步**；
- 「登录」「邀请码」「角色权限」仅用于本机交互演示，不构成真实身份验证或安全隔离；
- 关闭 App 后无推送（需要 Web Push + 后端）；语音识别、剪贴板、Service Worker 依赖 HTTPS；
- 接入真实后端后，上述限制随之消除，前端无需重构。

## 测试

`tests/` 覆盖：模拟云权限/可见性/幂等/移出（core）、计划生成与事务回滚（plan）、看板聚合与跨夜拆分（dashboard）、素材库覆盖度（library）、语音解析（voice-parser）、演示数据幂等（demo）。共 142 例。
