# 小芽育儿 H5 原型

一个本地优先、移动端优先的可交互育儿产品，基于 Svelte 5、TypeScript、Dexie 与 PWA 构建。

- 今日育儿仪表盘
- 家庭日程与任务完成
- 育儿知识库与紧急应对入口
- 活动分步骤执行与进度续接
- 喂养、睡眠、尿布、活动记录
- 生长趋势与家庭协作入口

## 技术结构

- Svelte 5 + TypeScript + Vite
- Dexie + IndexedDB 本地持久化
- vite-plugin-pwa 离线缓存与桌面安装
- 原生 CSS 与 SVG 图表

## 本地运行

```bash
yarn install
yarn dev
```

构建与类型检查：

```bash
yarn typecheck
yarn build
```

所有日程、活动进度和成长记录都保存在浏览器 IndexedDB 中。清理站点数据会删除本地内容，后续版本将补充 JSON 和 WebDAV 备份。

原型状态保存在浏览器 `localStorage` 中，刷新后活动步骤、任务完成状态和新增记录仍会保留。
