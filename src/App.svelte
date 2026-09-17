<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from './components/Icon.svelte'
  import TopBar from './components/TopBar.svelte'
  import { activitySteps } from './lib/data'
  import {
    db,
    initializeDatabase,
    loadActivityProgress,
    loadCareRecords,
    loadSchedules
  } from './lib/database'
  import type {
    CalendarMode,
    CareRecord,
    ModalType,
    RecordType,
    Schedule,
    TabId
  } from './lib/types'

  const navItems: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'today', label: '今日', icon: 'home' },
    { id: 'calendar', label: '日程', icon: 'calendar' },
    { id: 'knowledge', label: '知识', icon: 'book' },
    { id: 'records', label: '记录', icon: 'chart' },
    { id: 'profile', label: '我的', icon: 'user' }
  ]

  const week: Array<[string, number]> = [
    ['一', 14], ['二', 15], ['三', 16], ['四', 17], ['五', 18], ['六', 19], ['日', 20]
  ]
  const knowledgeCategories = ['推荐', '喂养', '睡眠', '成长', '护理']
  const recordTypes: Array<{ name: RecordType; icon: string }> = [
    { name: '喂养', icon: 'milk' },
    { name: '睡眠', icon: 'moon' },
    { name: '尿布', icon: 'drop' },
    { name: '活动', icon: 'activity' }
  ]

  let activeTab = $state<TabId>('today')
  let selectedDay = $state(17)
  let calendarMode = $state<CalendarMode>('周')
  let articleCategory = $state('推荐')
  let modal = $state<ModalType>(null)
  let schedules = $state<Schedule[]>([])
  let records = $state<CareRecord[]>([])
  let activityStep = $state(0)
  let ready = $state(false)
  let loadError = $state('')
  let toastMessage = $state('')
  let selectedRecordType = $state<RecordType>('喂养')
  let recordTime = $state(new Date().toTimeString().slice(0, 5))
  let recordNote = $state('')
  let scheduleTitle = $state('亲子阅读')
  let scheduleTime = $state('19:30')
  let scheduleOwner = $state('妈妈')

  const selectedSchedules = $derived(schedules.filter((item) => item.day === selectedDay))
  const todaySchedules = $derived(schedules.filter((item) => item.day === 17))
  const planPercent = $derived(Math.round((activityStep / activitySteps.length) * 100))
  const currentActivityStep = $derived(activitySteps[Math.min(activityStep, activitySteps.length - 1)])

  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // --------------------------------------------------------------------
  // 数据加载：页面状态始终从 Dexie 重新获取，避免内存与持久层分叉
  // --------------------------------------------------------------------

  onMount(async () => {
    try {
      await initializeDatabase()
      await refreshData()
      ready = true
    } catch (error) {
      loadError = error instanceof Error ? error.message : '本地数据初始化失败'
    }
  })

  async function refreshData(): Promise<void> {
    const [nextSchedules, nextRecords, progress] = await Promise.all([
      loadSchedules(),
      loadCareRecords(),
      loadActivityProgress()
    ])
    schedules = nextSchedules
    records = nextRecords
    activityStep = progress.step
  }

  function switchTab(tab: TabId): void {
    activeTab = tab
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  function showToast(message: string): void {
    if (toastTimer) clearTimeout(toastTimer)
    toastMessage = message
    toastTimer = setTimeout(() => {
      toastMessage = ''
    }, 1800)
  }

  function openModal(type: Exclude<ModalType, null>): void {
    modal = type
    document.body.style.overflow = 'hidden'
  }

  function closeModal(): void {
    modal = null
    document.body.style.overflow = ''
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && modal) closeModal()
  }

  async function toggleSchedule(id: string): Promise<void> {
    const schedule = schedules.find((item) => item.id === id)
    if (!schedule) return

    const status = schedule.status === 'completed' ? 'pending' : 'completed'
    await db.schedules.update(id, { status })
    await refreshData()
    showToast(status === 'completed' ? '已完成，记录已同步' : '已恢复为待完成')
  }

  function openRecord(type: RecordType = '喂养'): void {
    selectedRecordType = type
    recordTime = new Date().toTimeString().slice(0, 5)
    recordNote = ''
    openModal('record')
  }

  async function saveRecord(): Promise<void> {
    const iconMap: Record<RecordType, string> = {
      喂养: 'milk',
      睡眠: 'moon',
      尿布: 'drop',
      活动: 'activity'
    }

    await db.careRecords.add({
      id: crypto.randomUUID(),
      type: selectedRecordType,
      icon: iconMap[selectedRecordType],
      title: selectedRecordType,
      detail: recordNote.trim() || '快速记录',
      date: '2026-09-17',
      time: recordTime,
      createdAt: new Date().toISOString()
    })
    await refreshData()
    closeModal()
    showToast('记录已保存到本地数据库')
  }

  async function saveSchedule(): Promise<void> {
    await db.schedules.add({
      id: crypto.randomUUID(),
      day: selectedDay,
      time: scheduleTime,
      title: scheduleTitle.trim() || '未命名日程',
      detail: `${scheduleOwner}负责`,
      color: '',
      status: 'pending',
      createdAt: new Date().toISOString()
    })
    await refreshData()
    closeModal()
    showToast('已加入家庭日程')
  }

  async function previousActivityStep(): Promise<void> {
    activityStep = Math.max(0, activityStep - 1)
    await db.activityProgress.put({
      activityId: 'tummy-14-days',
      step: activityStep,
      completed: false,
      updatedAt: new Date().toISOString()
    })
  }

  async function nextActivityStep(): Promise<void> {
    if (activityStep < activitySteps.length - 1) {
      activityStep += 1
      await db.activityProgress.put({
        activityId: 'tummy-14-days',
        step: activityStep,
        completed: false,
        updatedAt: new Date().toISOString()
      })
      return
    }

    activityStep = activitySteps.length
    await db.transaction('rw', db.activityProgress, db.schedules, db.careRecords, async () => {
      await db.activityProgress.put({
        activityId: 'tummy-14-days',
        step: activitySteps.length,
        completed: true,
        updatedAt: new Date().toISOString()
      })
      await db.schedules.update('tummy', { status: 'completed' })
      await db.careRecords.put({
        id: `activity-tummy-${new Date().toISOString().slice(0, 10)}`,
        type: '活动',
        icon: 'activity',
        title: '趴卧适应练习',
        detail: '完成 4 个步骤 · 状态良好',
        date: '2026-09-17',
        time: new Date().toTimeString().slice(0, 5),
        createdAt: new Date().toISOString()
      })
    })
    await refreshData()
    closeModal()
    showToast('活动已完成，成长记录已生成')
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<main class="app-shell" aria-label="小芽育儿应用">
  {#if !ready && !loadError}
    <div class="app-loading" aria-live="polite">
      <span class="loading-leaf"></span>
      <strong>正在准备宝宝的数据</strong>
    </div>
  {:else if loadError}
    <div class="app-loading error-state">
      <Icon name="alert" />
      <strong>本地数据读取失败</strong>
      <p>{loadError}</p>
      <button class="primary-button" type="button" onclick={() => location.reload()}>重新加载</button>
    </div>
  {:else}
    <div class="page-stage">
      {#if activeTab === 'today'}
        <section class="page" data-page="today">
          <TopBar eyebrow="9月17日 · 星期四" title="早上好，安安妈妈" action="avatar" onaction={() => switchTab('profile')} />

          <article class="card baby-hero">
            <span class="hero-label">宝宝今天 · 5月12天</span>
            <h2>正在探索翻身，也更喜欢听见你的声音</h2>
            <p>今天适合做短时趴卧与追视练习，跟随宝宝状态，不需要追求完成数量。</p>
            <div class="hero-tags"><span class="pill">大运动</span><span class="pill">语言启蒙</span></div>
          </article>

          <section class="section">
            <div class="section-heading"><h2>今日状态</h2><button type="button" onclick={() => switchTab('records')}>查看记录</button></div>
            <div class="stat-grid">
              <article class="card stat-card"><span class="stat-icon"><Icon name="milk" /></span><strong class="stat-value">5 次</strong><span class="stat-name">今日喂养</span></article>
              <article class="card stat-card"><span class="stat-icon"><Icon name="moon" /></span><strong class="stat-value">11h</strong><span class="stat-name">累计睡眠</span></article>
              <article class="card stat-card"><span class="stat-icon"><Icon name="drop" /></span><strong class="stat-value">4 次</strong><span class="stat-name">今日尿布</span></article>
            </div>
          </section>

          <section class="section">
            <div class="section-heading"><h2>继续成长计划</h2><button type="button" onclick={() => switchTab('calendar')}>全部日程</button></div>
            <article class="card plan-card">
              <div class="plan-top">
                <div><span class="pill">14 天计划 · 第 3 天</span><h3 class="plan-title">趴卧适应练习</h3><p class="plan-copy">已坚持 2 天，今天约 3 分钟</p></div>
                <div class="progress-ring" style={`--progress:${planPercent}`} data-value={`${planPercent}%`} aria-label={`计划完成 ${planPercent}%`}></div>
              </div>
              <div class="step-preview">
                <span class="step-number">{Math.min(activityStep + 1, activitySteps.length)}</span>
                <div>
                  <strong>{activitySteps[activityStep]?.title ?? '今日练习已完成'}</strong>
                  <span>{activityStep < activitySteps.length ? `步骤 ${activityStep + 1}/${activitySteps.length} · 可从此处继续` : '已形成一条成长记录'}</span>
                </div>
                <button class="play-button" type="button" onclick={() => openModal('activity')} aria-label={activityStep < activitySteps.length ? '继续活动' : '重新查看活动'}>
                  <Icon name={activityStep < activitySteps.length ? 'play' : 'check'} />
                </button>
              </div>
            </article>
          </section>

          <section class="section">
            <div class="section-heading"><h2>接下来</h2><button type="button" onclick={() => openModal('schedule')}>添加安排</button></div>
            <div class="timeline-list">
              {#each todaySchedules as schedule (schedule.id)}
                <div class="timeline-item">
                  <span class="timeline-time">{schedule.time}</span><span class="timeline-mark"></span>
                  <article class:done={schedule.status === 'completed'} class="card timeline-content">
                    <div><h3>{schedule.title}</h3><p>{schedule.detail}</p></div>
                    <button class:checked={schedule.status === 'completed'} class="task-check" type="button" onclick={() => toggleSchedule(schedule.id)} aria-label={schedule.status === 'completed' ? '标记为未完成' : '标记为完成'}><Icon name="check" /></button>
                  </article>
                </div>
              {/each}
            </div>
          </section>
        </section>

      {:else if activeTab === 'calendar'}
        <section class="page" data-page="calendar">
          <TopBar eyebrow="成长节奏" title="家庭日程" onaction={() => showToast('今天没有新的通知')} />
          <div class="calendar-switch" role="tablist">
            {#each ['日', '周', '月'] as mode}
              <button class:active={calendarMode === mode} type="button" role="tab" aria-selected={calendarMode === mode} onclick={() => { calendarMode = mode as CalendarMode; showToast(`已切换到${mode}视图`) }}>{mode}</button>
            {/each}
          </div>
          <div class="calendar-header">
            <div><p class="eyebrow">2026年</p><h2>九月</h2></div>
            <div class="calendar-arrows">
              <button class="icon-button" type="button" aria-label="上一周" onclick={() => showToast('已切换到上一周')}><Icon name="chevron-left" /></button>
              <button class="icon-button" type="button" aria-label="下一周" onclick={() => showToast('已切换到下一周')}><Icon name="chevron-right" /></button>
            </div>
          </div>
          <div class="week-strip" aria-label="本周日期">
            {#each week as [day, date]}
              <button class:selected={selectedDay === date} class="day-button" type="button" onclick={() => selectedDay = date}>
                <span>周{day}</span><strong>{date}</strong>{#if [15, 17, 18, 20].includes(date)}<i></i>{/if}
              </button>
            {/each}
          </div>

          <div class="daily-summary">
            <div><h2>{selectedDay === 17 ? '今天' : `9月${selectedDay}日`}的安排</h2><p>{selectedSchedules.length} 项安排 · 本机离线保存</p></div>
            <span class="score">{selectedSchedules.filter((item) => item.status === 'completed').length}/{selectedSchedules.length} 完成</span>
          </div>
          <div class="schedule-list">
            {#each selectedSchedules as schedule (schedule.id)}
              <article class:completed={schedule.status === 'completed'} class="card schedule-item">
                <span class="schedule-time">{schedule.time}</span><span class={`schedule-bar ${schedule.color}`}></span>
                <div class="schedule-info"><h3>{schedule.title}</h3><p>{schedule.detail}</p></div>
                <button class:checked={schedule.status === 'completed'} class="task-check" type="button" onclick={() => toggleSchedule(schedule.id)} aria-label={schedule.status === 'completed' ? '取消完成' : '完成任务'}><Icon name="check" /></button>
              </article>
            {:else}
              <div class="empty-state"><Icon name="calendar" /><strong>今天还没有安排</strong><span>留一点空白，也是一种好节奏</span></div>
            {/each}
          </div>
          <button class="secondary-button add-schedule" type="button" onclick={() => openModal('schedule')}><Icon name="plus" /> 添加日程</button>

          <section class="section">
            <div class="section-heading"><h2>本周成长目标</h2><button type="button" onclick={() => showToast('目标调整功能已预留')}>调整目标</button></div>
            <article class="card plan-card"><div class="plan-top"><div><span class="pill orange">本周重点</span><h3 class="plan-title">建立稳定的睡前流程</h3><p class="plan-copy">洗澡 → 抚触 → 喂奶 → 阅读</p></div><div class="progress-ring" style="--progress:60" data-value="3/5"></div></div></article>
          </section>
        </section>

      {:else if activeTab === 'knowledge'}
        <section class="page" data-page="knowledge">
          <TopBar eyebrow="科学育儿 · 医护审核" title="育儿知识库" onaction={() => showToast('今天没有新的通知')} />
          <label class="search-box"><Icon name="search" /><input type="search" placeholder="搜索：宝宝总是夜醒怎么办？" aria-label="搜索育儿知识" /></label>
          <div class="chip-row">
            {#each knowledgeCategories as category}<button class:active={articleCategory === category} class="chip" type="button" onclick={() => articleCategory = category}>{category}</button>{/each}
          </div>
          <section class="section">
            <article class="card feature-article">
              <span class="pill">5 月龄精选</span><h2>宝宝开始翻身，家里要做好哪些安全准备？</h2><p>从睡眠空间到换尿布台，一次完成居家安全检查。</p>
              <button class="text-button" type="button" onclick={() => openModal('article')}>阅读 4 分钟 <Icon name="chevron-right" /></button>
            </article>
          </section>
          <section class="section">
            <div class="section-heading"><h2>按场景查找</h2><button type="button" onclick={() => showToast('分类功能已预留')}>全部分类</button></div>
            <div class="category-grid">
              <button class="category" type="button" onclick={() => showToast('已进入喂养辅食')}><span class="category-icon"><Icon name="milk" /></span><span>喂养辅食</span></button>
              <button class="category" type="button" onclick={() => showToast('已进入睡眠安抚')}><span class="category-icon"><Icon name="moon" /></span><span>睡眠安抚</span></button>
              <button class="category" type="button" onclick={() => showToast('已进入成长发育')}><span class="category-icon"><Icon name="activity" /></span><span>成长发育</span></button>
              <button class="category" type="button" onclick={() => openModal('emergency')}><span class="category-icon"><Icon name="alert" /></span><span>紧急应对</span></button>
            </div>
          </section>
          <section class="section">
            <div class="section-heading"><h2>{articleCategory}内容</h2><button type="button" onclick={() => showToast('已为你更新内容')}>换一批</button></div>
            <div class="article-list">
              {#each [
                ['moon', '频繁夜醒是睡眠倒退吗？', '睡眠 · 医生审核 · 6 分钟'],
                ['activity', '5 月龄可以做的 6 个亲子游戏', '活动游戏 · 8.2 万人收藏'],
                ['shield', '添加第一口辅食前的准备清单', '喂养 · 营养师审核 · 5 分钟']
              ] as article}
                <button class="card article-card article-button" type="button" onclick={() => openModal('article')}><span class="article-cover"><Icon name={article[0]} /></span><span class="article-copy"><strong>{article[1]}</strong><small>{article[2]}</small></span><Icon name="chevron-right" /></button>
              {/each}
            </div>
          </section>
        </section>

      {:else if activeTab === 'records'}
        <section class="page" data-page="records">
          <TopBar eyebrow="本地离线记录" title="成长记录" onaction={() => showToast('今天没有新的通知')} />
          <section>
            <div class="section-heading"><h2>快速记录</h2><button type="button" onclick={() => openRecord()}>更多</button></div>
            <div class="quick-record-grid">
              {#each recordTypes as item}
                <button class="record-action" type="button" onclick={() => openRecord(item.name)}><Icon name={item.icon} /><span>{item.name}</span></button>
              {/each}
            </div>
          </section>
          <section class="section">
            <div class="section-heading"><h2>生长趋势</h2><button type="button" onclick={() => showToast('完整报告功能已预留')}>完整报告</button></div>
            <article class="card growth-card">
              <div class="growth-header"><div class="growth-value"><strong>7.2</strong><span>kg · 9月15日</span></div><div class="growth-tabs"><button class="active" type="button">体重</button><button type="button">身高</button><button type="button">头围</button></div></div>
              <div class="chart-wrap">
                <svg viewBox="0 0 340 150" role="img" aria-label="宝宝最近五个月的体重增长曲线">
                  <defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fa089" stop-opacity=".28"/><stop offset="1" stop-color="#7fa089" stop-opacity="0"/></linearGradient></defs>
                  <g class="chart-grid"><line x1="20" y1="30" x2="328" y2="30"/><line x1="20" y1="75" x2="328" y2="75"/><line x1="20" y1="120" x2="328" y2="120"/></g>
                  <path class="chart-area" d="M20 118 C65 105,72 98,98 93 S145 78,174 70 S225 58,250 49 S295 37,328 31 L328 130 L20 130Z"/>
                  <path class="chart-line" d="M20 118 C65 105,72 98,98 93 S145 78,174 70 S225 58,250 49 S295 37,328 31"/>
                  <g><circle class="chart-dot" cx="20" cy="118" r="4"/><circle class="chart-dot" cx="98" cy="93" r="4"/><circle class="chart-dot" cx="174" cy="70" r="4"/><circle class="chart-dot" cx="250" cy="49" r="4"/><circle class="chart-dot" cx="328" cy="31" r="5"/></g>
                  <g class="chart-label"><text x="13" y="145">5月</text><text x="89" y="145">6月</text><text x="165" y="145">7月</text><text x="241" y="145">8月</text><text x="313" y="145">9月</text></g>
                </svg>
              </div>
              <span class="pill">在参考生长曲线范围内</span>
            </article>
          </section>
          <section class="section">
            <div class="section-heading"><h2>今日时间线</h2><button type="button" onclick={() => openRecord()}>添加</button></div>
            <div class="log-list">
              {#each records as record (record.id)}
                <article class="card log-item"><span class="log-icon"><Icon name={record.icon} /></span><div><h3>{record.title}</h3><p>{record.detail}</p></div><span class="log-time">{record.time}</span></article>
              {/each}
            </div>
          </section>
        </section>

      {:else}
        <section class="page" data-page="profile">
          <TopBar eyebrow="家庭空间" title="安安的成长档案" action="settings" onaction={() => showToast('设置功能已预留')} />
          <article class="card profile-card">
            <div class="baby-avatar">安</div><h2>安安</h2><p>2026年4月5日出生 · 5月12天</p>
            <div class="profile-stats"><div class="profile-stat"><strong>7.2 kg</strong><span>体重</span></div><div class="profile-stat"><strong>65.4 cm</strong><span>身高</span></div><div class="profile-stat"><strong>42 cm</strong><span>头围</span></div></div>
          </article>
          <section class="section">
            <div class="section-heading"><div><h2>家庭成员</h2><p class="subtitle">一起记录，共同照护</p></div><button type="button" onclick={() => showToast('成员管理功能已预留')}>管理</button></div>
            <div class="family-stack"><span class="family-avatar">妈妈</span><span class="family-avatar">爸爸</span><span class="family-avatar">外婆</span><button class="family-avatar add" type="button" onclick={() => showToast('邀请功能已预留')} aria-label="邀请成员"><Icon name="plus" /></button></div>
          </section>
          <section class="section">
            <div class="section-heading"><h2>育儿工具</h2></div>
            <div class="card settings-list">
              {#each [['calendar', '疫苗与体检'], ['users', '照护交接'], ['chart', '成长报告'], ['shield', '隐私与数据'], ['settings', '提醒设置']] as item}
                <button class="setting-item" type="button" onclick={() => showToast(`${item[1]}功能已预留`)}><span class="setting-icon"><Icon name={item[0]} /></span><span>{item[1]}</span><Icon name="chevron-right" /></button>
              {/each}
            </div>
          </section>
        </section>
      {/if}
    </div>

    <button class="emergency-fab" type="button" aria-label="打开紧急应对" onclick={() => openModal('emergency')}><Icon name="alert" /><span>紧急</span></button>
    <nav class="bottom-nav" aria-label="主要导航">
      {#each navItems as item}
        <button class:active={activeTab === item.id} class="nav-item" type="button" aria-label={item.label} aria-current={activeTab === item.id ? 'page' : undefined} onclick={() => switchTab(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>
      {/each}
    </nav>
  {/if}
</main>

{#if modal}
  <div class="modal-backdrop" role="presentation" onclick={(event) => event.target === event.currentTarget && closeModal()}>
    <dialog open class:emergency-sheet={modal === 'emergency'} class="bottom-sheet" aria-modal="true">
      <div class="sheet-handle"></div>

      {#if modal === 'emergency'}
        <div class="modal-head"><div><p class="eyebrow emergency-title">离线可用 · 紧急指南</p><h2 class="emergency-title">发生了什么？</h2></div><button class="icon-button" type="button" onclick={closeModal} aria-label="关闭"><Icon name="close" /></button></div>
        <div class="emergency-list">{#each ['异物卡喉', '呼吸困难', '高热惊厥', '跌落撞伤', '烫伤', '误食误服'] as item}<button class="emergency-option" type="button" onclick={() => showToast(`正在打开「${item}」急救步骤`)}>{item}</button>{/each}</div>
        <div class="emergency-note"><Icon name="alert" /><span>如宝宝失去意识、明显呼吸困难或面色发紫，请立即拨打当地急救电话。本指南不能替代专业医疗救助。</span></div>
        <button class="danger-button full-button" type="button" onclick={() => showToast('原型中不会发起真实通话')}>拨打 120 急救电话</button>

      {:else if modal === 'activity'}
        <div class="modal-head"><div><p class="eyebrow">趴卧适应练习 · 约 3 分钟</p><h2>跟着步骤一起做</h2></div><button class="icon-button" type="button" onclick={closeModal} aria-label="退出活动"><Icon name="close" /></button></div>
        <div class="activity-progress" aria-label="步骤进度"><span style={`width:${((Math.min(activityStep, activitySteps.length - 1) + 1) / activitySteps.length) * 100}%`}></span></div>
        <div class="activity-visual"><div class="tummy-illustration"><span class="mat"></span><span class="baby-body"></span><span class="baby-arm"></span><span class="baby-head"></span></div></div>
        <div class="activity-step-label">步骤 {Math.min(activityStep, activitySteps.length - 1) + 1} / {activitySteps.length}</div>
        <h3 class="activity-title">{currentActivityStep.title}</h3><p class="activity-description">{currentActivityStep.text}</p>
        <div class="safety-tip"><Icon name="shield" /><span>{currentActivityStep.tip}</span></div>
        <div class="modal-actions"><button class="secondary-button" type="button" disabled={activityStep === 0} onclick={previousActivityStep}>上一步</button><button class="primary-button" type="button" onclick={nextActivityStep}>{activityStep >= activitySteps.length - 1 ? '完成并记录' : '完成这一步'}</button></div>

      {:else if modal === 'record'}
        <div class="modal-head"><div><p class="eyebrow">一键完成</p><h2>添加一条记录</h2></div><button class="icon-button" type="button" onclick={closeModal} aria-label="关闭"><Icon name="close" /></button></div>
        <div class="record-type-grid">{#each recordTypes as item}<button class:selected={selectedRecordType === item.name} class="record-type" type="button" onclick={() => selectedRecordType = item.name}><Icon name={item.icon} />{item.name}</button>{/each}</div>
        <div class="form-group"><label for="recordTime">记录时间</label><input class="form-control" id="recordTime" type="time" bind:value={recordTime} /></div>
        <div class="form-group"><label for="recordNote">备注</label><input class="form-control" id="recordNote" placeholder="例如：状态很好，完成 3 分钟" bind:value={recordNote} /></div>
        <button class="primary-button full-button" type="button" onclick={saveRecord}>保存记录</button>

      {:else if modal === 'schedule'}
        <div class="modal-head"><div><p class="eyebrow">保存到本机 · 9月{selectedDay}日</p><h2>添加日程</h2></div><button class="icon-button" type="button" onclick={closeModal} aria-label="关闭"><Icon name="close" /></button></div>
        <div class="form-group"><label for="scheduleTitle">安排内容</label><input class="form-control" id="scheduleTitle" bind:value={scheduleTitle} /></div>
        <div class="form-group"><label for="scheduleTime">开始时间</label><input class="form-control" id="scheduleTime" type="time" bind:value={scheduleTime} /></div>
        <div class="form-group"><label for="scheduleOwner">负责人</label><select class="form-control" id="scheduleOwner" bind:value={scheduleOwner}><option>妈妈</option><option>爸爸</option><option>外婆</option></select></div>
        <button class="primary-button full-button" type="button" onclick={saveSchedule}>加入日程</button>

      {:else if modal === 'article'}
        <div class="modal-head"><div><p class="eyebrow">5 月龄 · 安全护理</p><h2>翻身期居家安全清单</h2></div><button class="icon-button" type="button" onclick={closeModal} aria-label="关闭"><Icon name="close" /></button></div>
        <span class="pill">儿科医生审核 · 2026年8月更新</span>
        <p class="modal-copy article-lead">当宝宝开始尝试翻身，活动范围会突然变大。换尿布、睡眠和日常放置宝宝的习惯，都需要同步调整。</p>
        <div class="card article-detail"><h3>首先完成这 3 件事</h3><p class="modal-copy">1. 不把宝宝单独留在床、沙发或换尿布台上。<br />2. 睡眠区域保持平整，不放枕头和松软物品。<br />3. 地面活动区移除小物件与尖锐边角。</p></div>
        <button class="primary-button full-button" type="button" onclick={() => { closeModal(); showToast('已收藏到育儿知识库') }}>收藏这篇知识</button>
      {/if}
    </dialog>
  </div>
{/if}

<div class:show={toastMessage} class="toast" role="status" aria-live="polite">{toastMessage}</div>
