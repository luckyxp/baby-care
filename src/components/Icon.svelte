<script lang="ts">
  interface Props {
    name: string
    className?: string
  }

  let { name, className = '' }: Props = $props()
</script>

<svg class={className} aria-hidden="true">
  <use href={`#i-${name}`}></use>
</svg>
