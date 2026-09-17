<script lang="ts">
  import Icon from './Icon.svelte'

  interface Props {
    eyebrow: string
    title: string
    action?: 'avatar' | 'bell' | 'settings'
    onaction?: () => void
  }

  let { eyebrow, title, action = 'bell', onaction = () => undefined }: Props = $props()
</script>

<header class="topbar">
  <div>
    <p class="eyebrow">{eyebrow}</p>
    <h1>{title}</h1>
  </div>
  {#if action === 'avatar'}
    <button class="icon-button avatar-button" type="button" aria-label="查看宝宝档案" onclick={onaction}>
      <span class="avatar-face"><i class="avatar-smile"></i></span>
    </button>
  {:else}
    <button class="icon-button" type="button" aria-label={action === 'bell' ? '查看通知' : '打开设置'} onclick={onaction}>
      <Icon name={action} />
    </button>
  {/if}
</header>
