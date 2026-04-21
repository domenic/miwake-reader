<script lang="ts" generics="T extends string">
  interface Option {
    id: T;
    label: string;
    description: string;
    isDefault?: boolean;
  }

  interface Props {
    heading: string;
    subHeading?: string;
    name: string;
    options: Option[];
    selected: T;
    onchange: (value: T) => void;
  }

  let { heading, subHeading, name, options, selected, onchange }: Props = $props();
</script>

<fieldset class="mt-4">
  <legend class="text-sm font-medium text-black">{heading}</legend>
  {#if subHeading}
    <p class="mt-1 mb-1 text-xs text-gray-600">{subHeading}</p>
  {/if}
  <div class="mt-1 space-y-1">
    {#each options as option (option.id)}
      {@const checked = selected === option.id}
      <label
        class="flex cursor-pointer gap-3 rounded-md border border-transparent p-3 hover:bg-black/5"
        class:bg-blue-50={checked}
        class:border-blue-200={checked}
      >
        <input
          type="radio"
          {name}
          value={option.id}
          {checked}
          class="mt-0.5"
          onchange={() => onchange(option.id)}
        />
        <div>
          <div class="text-sm font-medium text-black">
            {option.label}
            {#if option.isDefault}
              <span class="font-normal text-gray-500">(default)</span>
            {/if}
          </div>
          <div class="text-xs text-gray-600">{option.description}</div>
        </div>
      </label>
    {/each}
  </div>
</fieldset>
