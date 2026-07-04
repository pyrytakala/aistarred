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

  const searchInput = panel.querySelector<HTMLInputElement>(".filter-dropdown-search-input");
  if (searchInput) {
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    window.requestAnimationFrame(() => searchInput.focus());
  }
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

export interface GroupedMultiSelectGroup {
  id: string;
  label: string;
  memberValues: string[];
}

export interface GroupedMultiSelectLeaf {
  value: string;
  label: string;
  groupId: string;
  searchText?: string;
}

function syncGroupCheckbox(
  checkbox: HTMLInputElement,
  selected: Set<string>,
  memberValues: string[],
): void {
  if (memberValues.length === 0) {
    checkbox.checked = false;
    checkbox.indeterminate = false;
    return;
  }

  let count = 0;
  for (const value of memberValues) {
    if (selected.has(value)) {
      count += 1;
    }
  }

  checkbox.checked = count === memberValues.length;
  checkbox.indeterminate = count > 0 && count < memberValues.length;
}

function createMultiSelectRow(
  value: string,
  label: string,
  selected: Set<string>,
  className: string,
  onToggle: (checked: boolean) => void,
): HTMLLabelElement {
  const row = document.createElement("label");
  row.className = className;
  row.dataset.filterValue = value;
  row.setAttribute("role", "option");
  const isSelected = selected.has(value);
  row.classList.toggle("is-selected", isSelected);
  row.setAttribute("aria-selected", isSelected ? "true" : "false");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isSelected;
  checkbox.addEventListener("change", (event) => {
    event.stopPropagation();
    onToggle(checkbox.checked);
  });
  row.appendChild(checkbox);

  const text = document.createElement("span");
  text.className = "filter-dropdown-option-label";
  text.textContent = label;
  row.appendChild(text);

  return row;
}

function forEachGroupedSection(
  list: HTMLElement,
  callback: (header: HTMLElement, items: HTMLElement[]) => void,
): void {
  const children = [...list.children] as HTMLElement[];
  let index = 0;
  while (index < children.length) {
    const child = children[index];
    if (!child.classList.contains("filter-dropdown-option--group")) {
      index += 1;
      continue;
    }

    const items: HTMLElement[] = [];
    index += 1;
    while (
      index < children.length &&
      children[index].classList.contains("filter-dropdown-option--nested")
    ) {
      items.push(children[index]);
      index += 1;
    }
    callback(child, items);
  }
}

function applyGroupedDropdownSearch(list: HTMLElement, rawQuery: string): void {
  const query = rawQuery.trim().toLowerCase();
  forEachGroupedSection(list, (header, items) => {
    const groupLabel =
      header.querySelector(".filter-dropdown-option-label")?.textContent?.toLowerCase() ?? "";
    const groupMatches = !query || groupLabel.includes(query);

    let anyItemVisible = false;
    for (const item of items) {
      const label =
        item.querySelector(".filter-dropdown-option-label")?.textContent?.toLowerCase() ?? "";
      const value = item.dataset.filterValue?.toLowerCase() ?? "";
      const extra = item.dataset.filterSearch?.toLowerCase() ?? "";
      const haystack = `${label} ${value} ${extra}`;
      const itemMatches = !query || groupMatches || haystack.includes(query);
      item.hidden = !itemMatches;
      if (itemMatches) {
        anyItemVisible = true;
      }
    }

    header.hidden = !query ? false : !(groupMatches || anyItemVisible);
  });
}

function mountGroupedDropdownSearch(
  panel: HTMLElement,
  list: HTMLElement,
  placeholder: string,
): void {
  const searchWrap = document.createElement("div");
  searchWrap.className = "filter-dropdown-search";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "filter-dropdown-search-input";
  searchInput.placeholder = placeholder;
  searchInput.setAttribute("aria-label", placeholder);
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.addEventListener("click", (event) => event.stopPropagation());
  searchInput.addEventListener("keydown", (event) => event.stopPropagation());
  searchInput.addEventListener("input", () => {
    applyGroupedDropdownSearch(list, searchInput.value);
  });

  searchWrap.appendChild(searchInput);
  panel.insertBefore(searchWrap, panel.firstChild);
}

export function mountGroupedMultiSelectDropdown(
  container: HTMLElement,
  config: {
    ariaLabel: string;
    summary: FilterDropdownSummary;
    panelClassName?: string;
    groups: GroupedMultiSelectGroup[];
    leaves: GroupedMultiSelectLeaf[];
    selectedValues: Set<string>;
    onChange: (selected: Set<string>) => void;
    bulkActions?: {
      selectAllLabel?: string;
      clearAllLabel?: string;
    };
    search?: {
      placeholder?: string;
    };
  },
): FilterDropdownHandle {
  let selected = new Set(config.selectedValues);
  const { list, handle, panel } = createDropdownShell(container, config.ariaLabel, config.summary);
  if (config.panelClassName) {
    panel.classList.add(config.panelClassName);
  }
  list.setAttribute("aria-multiselectable", "true");

  if (config.search) {
    mountGroupedDropdownSearch(
      panel,
      list,
      config.search.placeholder ?? "Search…",
    );
  }

  const allValues = config.leaves.map((leaf) => leaf.value);
  const groupCheckboxes = new Map<string, HTMLInputElement>();
  const leavesByGroup = new Map<string, GroupedMultiSelectLeaf[]>();
  for (const leaf of config.leaves) {
    const bucket = leavesByGroup.get(leaf.groupId) ?? [];
    bucket.push(leaf);
    leavesByGroup.set(leaf.groupId, bucket);
  }

  const applySelection = (next: Set<string>): void => {
    selected = next;
    config.onChange(next);
    handle.updateSelection(selected);
  };

  const syncAllGroupCheckboxes = (): void => {
    for (const group of config.groups) {
      const checkbox = groupCheckboxes.get(group.id);
      if (!checkbox) {
        continue;
      }
      syncGroupCheckbox(checkbox, selected, group.memberValues);
      const header = checkbox.closest<HTMLElement>(".filter-dropdown-option");
      if (header) {
        header.classList.toggle("is-selected", checkbox.checked);
        header.setAttribute("aria-selected", checkbox.checked ? "true" : "false");
      }
    }
  };

  const originalUpdateSelection = handle.updateSelection.bind(handle);
  handle.updateSelection = (selectedValues: Set<string>) => {
    originalUpdateSelection(selectedValues);
    syncAllGroupCheckboxes();
  };

  if (config.bulkActions) {
    const bulkBar = document.createElement("div");
    bulkBar.className = "filter-dropdown-bulk-actions";

    const selectAll = document.createElement("button");
    selectAll.type = "button";
    selectAll.className = "filter-dropdown-bulk-action";
    selectAll.textContent = config.bulkActions.selectAllLabel ?? "Select all";
    selectAll.addEventListener("click", (event) => {
      event.stopPropagation();
      applySelection(new Set(allValues));
    });

    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "filter-dropdown-bulk-action";
    clearAll.textContent = config.bulkActions.clearAllLabel ?? "Clear all";
    clearAll.addEventListener("click", (event) => {
      event.stopPropagation();
      applySelection(new Set());
    });

    bulkBar.append(selectAll, clearAll);
    panel.insertBefore(bulkBar, list);
  }

  for (const group of config.groups) {
    const groupValue = `__group__:${group.id}`;
    const header = createMultiSelectRow(
      groupValue,
      group.label,
      selected,
      "filter-dropdown-option filter-dropdown-option--multi filter-dropdown-option--group",
      (checked) => {
        const next = new Set(selected);
        for (const value of group.memberValues) {
          if (checked) {
            next.add(value);
          } else {
            next.delete(value);
          }
        }
        applySelection(next);
      },
    );
    const groupCheckbox = header.querySelector("input");
    if (groupCheckbox instanceof HTMLInputElement) {
      groupCheckboxes.set(group.id, groupCheckbox);
      syncGroupCheckbox(groupCheckbox, selected, group.memberValues);
    }
    list.appendChild(header);

    const leaves = leavesByGroup.get(group.id) ?? [];
    for (const leaf of leaves) {
      const row = createMultiSelectRow(
        leaf.value,
        leaf.label,
        selected,
        "filter-dropdown-option filter-dropdown-option--multi filter-dropdown-option--nested",
        (checked) => {
          const next = new Set(selected);
          if (checked) {
            next.add(leaf.value);
          } else {
            next.delete(leaf.value);
          }
          applySelection(next);
        },
      );
      if (leaf.searchText) {
        row.dataset.filterSearch = leaf.searchText;
      }
      list.appendChild(row);
    }
  }

  syncAllGroupCheckboxes();
  return handle;
}
