import { SettingRow, SettingToggle } from "./SettingRow";
import { Segmented } from "./ui/segmented";
import { useTableDisplayPrefs } from "../hooks/useTableDisplayPrefs";
import { TABLE_DENSITY_OPTIONS, type TableDisplayPrefs } from "../lib/tableViewPrefs";

/** Profile → Display: row density, wrap and freeze for every table. The table toolbar's gear edits the
 *  same setting; both apply straight away. Renders rows, to sit in the Display card's list. */
export function TableDisplaySettings() {
  const [prefs, setPrefs] = useTableDisplayPrefs();
  const set = (patch: Partial<TableDisplayPrefs>) => setPrefs({ ...prefs, ...patch });

  return (
    <>
      <SettingRow label="Table rows" labelId="table-rows-label">
        <Segmented
          labelId="table-rows-label"
          options={TABLE_DENSITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={prefs.density}
          onChange={(density) => set({ density })}
        />
      </SettingRow>
      <SettingToggle label="Wrap text" checked={prefs.wrap} onChange={(wrap) => set({ wrap })} />
      <SettingToggle
        label="Freeze first column"
        checked={prefs.freezeFirstColumn}
        onChange={(freezeFirstColumn) => set({ freezeFirstColumn })}
      />
    </>
  );
}
