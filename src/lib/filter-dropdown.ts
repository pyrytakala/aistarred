import type { FilterDropdownSummary } from "./filter-summary.js";

export type { FilterDropdownSummary };

export interface FilterDropdownHandle {
  updateSummary(summary: FilterDropdownSummary): void;
  updateSelection(selectedValues: Set<string>): void;
  close(): void;
}

let openDropdown: HTMLElement | null = null;
let dropdownInteractionMounted = false;

function summaryAriaLabel(summary: FilterDropdownSummary): string {
  return `${summary.label}: ${summary.value}`;
}

function applySummary(
  valueEl: HTMLElement,
  trigger: HTMLButtonElement,
  summary: FilterDropdownSummary,
): void {
  valueEl.textContent = summary.value;
  trigger.setAttribute("aria-label", summaryAriaLabel(summary));
  trigger.classList.toggle("filter-dropdown-trigger--active", summary.active === true);
}

function closeOpenDropdown(): void {
  if (!openDropdown) {
    return;
  }
  const trigger = openDropdown.querySelector<HTMLButtonElement>(".filter-dropdown-trigger");
  const panel = openDropdown.querySelector<HTMLElement>(".filter-dropdown-panel");
  trigger?.setAttribute("aria-expanded", "false");
  if (panel) {
    panel.hidden = true;
  }
  openDropdown = null;
}

function openDropdownPanel(dropdown: HTMLElement): void {
  if (openDropdown && openDropdown !== dropdown) {
    closeOpenDropdown();
  }
  const trigger = dropdown.querySelector<HTMLButtonElement>(".filter-dropdown-trigger");
  const panel = dropdown.querySelector<HTMLElement>(".filter-dropdown-panel");
  if (!trigger || !panel) {
    return;
  }
  trigger.setAttribute("aria-expanded", "true");
  panel.hidden = false;
  openDropdown = dropdown;
}

export function mountFilterDropdownInteraction(): void {
  if (dropdownInteractionMounted) {
    return;
  }
  dropdownInteractionMounted = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (!target.closest(".filter-dropdown")) {
      closeOpenDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOpenDropdown();
    }
  });
}

function createDropdownShell(
  container: HTMLElement,
  ariaLabel: string,
  summary: FilterDropdownSummary,
  summaryIconHtml?: string,
): {
  dropdown: HTMLElement;
  trigger: HTMLButtonElement;
  valueEl: HTMLElement;
  panel: HTMLElement;
  list: HTMLElement;
  handle: FilterDropdownHandle;
} {
  container.replaceChildren();
  container.className = "filter-dropdown-wrap";

  const dropdown = document.createElement("div");
  dropdown.className = "filter-dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "filter-dropdown-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", ariaLabel);

  const summaryEl = document.createElement("span");
  summaryEl.className = "filter-dropdown-summary";

  const valueEl = document.createElement("span");
  valueEl.className = "filter-dropdown-summary-value";
  summaryEl.appendChild(valueEl);

  if (summaryIconHtml) {
    const icon = document.createElement("span");
    icon.className = "filter-dropdown-trigger-icon";
    icon.innerHTML = summaryIconHtml;
    icon.setAttribute("aria-hidden", "true");
    trigger.appendChild(icon);
  }

  trigger.appendChild(summaryEl);

  const chevron = document.createElement("span");
  chevron.className = "filter-dropdown-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▾";
  trigger.appendChild(chevron);

  applySummary(valueEl, trigger, summary);

  const panel = document.createElement("div");
  panel.className = "filter-dropdown-panel";
  panel.hidden = true;

  const list = document.createElement("div");
  list.className = "filter-dropdown-list";
  list.setAttribute("role", "listbox");
  panel.appendChild(list);

  dropdown.append(trigger, panel);
  container.appendChild(dropdown);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (openDropdown === dropdown) {
      closeOpenDropdown();
      return;
    }
    openDropdownPanel(dropdown);
  });

  const handle: FilterDropdownHandle = {
    updateSummary(nextSummary: FilterDropdownSummary) {
      applySummary(valueEl, trigger, nextSummary);
    },
    updateSelection(selectedValues: Set<string>) {
      for (const option of list.querySelectorAll<HTMLElement>(".filter-dropdown-option")) {
        const value = option.dataset.filterValue;
        if (!value) {
          continue;
        }
        const selected = selectedValues.has(value);
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-selected", selected ? "true" : "false");
        const checkbox = option.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (checkbox) {
          checkbox.checked = selected;
        }
      }
    },
    close() {
      if (openDropdown === dropdown) {
        closeOpenDropdown();
      }
    },
  };

  return { dropdown, trigger, valueEl, panel, list, handle };
}

export interface SingleSelectDropdownOption {
  value: string;
  label: string;
}

export function mountSingleSelectDropdown(
  container: HTMLElement,
  config: {
    ariaLabel: string;
    summary: FilterDropdownSummary;
    summaryIconHtml?: string;
    options: SingleSelectDropdownOption[];
    selectedValue: string;
    onChange: (value: string) => void;
  },
): FilterDropdownHandle {
  let currentValue = config.selectedValue;
  const { list, handle } = createDropdownShell(
    container,
    config.ariaLabel,
    config.summary,
    config.summaryIconHtml,
  );

  for (const option of config.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-dropdown-option";
    button.dataset.filterValue = option.value;
    button.setAttribute("role", "option");
    button.textContent = option.label;
    const isSelected = option.value === currentValue;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-selected", isSelected ? "true" : "false");

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (option.value === currentValue) {
        handle.close();
        return;
      }
      currentValue = option.value;
      config.onChange(option.value);
      handle.updateSelection(new Set([option.value]));
      handle.close();
    });

    list.appendChild(button);
  }

  return handle;
}

export interface MultiSelectDropdownOption {
  value: string;
  label: string;
  iconHtml?: string;
}

export function mountMultiSelectDropdown(
  container: HTMLElement,
  config: {
    ariaLabel: string;
    summary: FilterDropdownSummary;
    options: MultiSelectDropdownOption[];
    selectedValues: Set<string>;
    onChange: (selected: Set<string>) => void;
  },
): FilterDropdownHandle {
  let selected = new Set(config.selectedValues);
  const { list, handle } = createDropdownShell(container, config.ariaLabel, config.summary);
  list.setAttribute("aria-multiselectable", "true");

  const applySelection = (next: Set<string>): void => {
    selected = next;
    config.onChange(next);
    handle.updateSelection(selected);
  };

  for (const option of config.options) {
    const row = document.createElement("label");
    row.className = "filter-dropdown-option filter-dropdown-option--multi";
    row.dataset.filterValue = option.value;
    row.setAttribute("role", "option");
    const isSelected = selected.has(option.value);
    row.classList.toggle("is-selected", isSelected);
    row.setAttribute("aria-selected", isSelected ? "true" : "false");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isSelected;
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      const next = new Set(selected);
      if (checkbox.checked) {
        next.add(option.value);
      } else {
        next.delete(option.value);
      }
      applySelection(next);
    });
    row.appendChild(checkbox);

    if (option.iconHtml) {
      const icon = document.createElement("span");
      icon.className = "filter-dropdown-option-icon";
      icon.innerHTML = option.iconHtml;
      icon.setAttribute("aria-hidden", "true");
      row.appendChild(icon);
    }

    const text = document.createElement("span");
    text.className = "filter-dropdown-option-label";
    text.textContent = option.label;
    row.appendChild(text);

    list.appendChild(row);
  }

  return handle;
}
