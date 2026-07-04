export interface FilterDropdownSummary {
  label: string;
  value: string;
  active?: boolean;
}

export function filterSummary(
  label: string,
  value: string,
  active = false,
): FilterDropdownSummary {
  return { label, value, active };
}

export function multiSelectFilterSummary(config: {
  label: string;
  total: number;
  selected: number;
  allValue: string;
  singleValue?: string;
  partialValue?: string;
}): FilterDropdownSummary {
  const { label, total, selected, allValue, singleValue, partialValue } = config;
  const active = selected > 0 && selected < total;

  if (selected === 0 || selected === total) {
    return { label, value: allValue, active: false };
  }
  if (selected === 1 && singleValue) {
    return { label, value: singleValue, active: true };
  }
  if (partialValue) {
    return { label, value: partialValue, active: true };
  }

  return { label, value: `${selected} selected`, active };
}
