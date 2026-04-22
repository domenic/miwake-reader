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

<fieldset class="mt-5">
  <legend class="mb-1 text-base font-medium">{heading}</legend>
  {#if subHeading}
    <p class="mb-1 text-sm text-gray-600">{subHeading}</p>
  {/if}
  <div class="mt-1 space-y-1">
    {#each options as option (option.id)}
      {@const checked = selected === option.id}
      <label class="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-gray-400/15">
        <input
          type="radio"
          {name}
          value={option.id}
          {checked}
          class="mt-1"
          onchange={() => onchange(option.id)}
        />
        <div>
          <div class="font-medium">
            {option.label}
            {#if option.isDefault}
              <span class="font-normal text-gray-500">(default)</span>
            {/if}
          </div>
          <div class="text-sm text-gray-600">{option.description}</div>
        </div>
      </label>
    {/each}
  </div>
</fieldset>
