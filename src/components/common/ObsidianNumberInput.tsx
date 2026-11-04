import { ObsidianTextInput } from './ObsidianTextInput'

type ObsidianNumberInputProps = {
  value: number | null | undefined
  /** Receives `undefined` when the field is cleared. Invalid input is ignored. */
  onChange: (value: number | undefined) => void
  /** Truncates the parsed value to an integer. */
  integer?: boolean
  /** Rejected values leave the stored value unchanged. */
  accept?: (value: number) => boolean
}

export function ObsidianNumberInput({
  value,
  onChange,
  integer = false,
  accept = () => true,
}: ObsidianNumberInputProps) {
  return (
    <ObsidianTextInput
      type="number"
      value={value == null ? '' : String(value)}
      onChange={(raw) => {
        const trimmed = raw.trim()
        if (trimmed === '') {
          onChange(undefined)
          return
        }
        const n = Number(trimmed)
        if (Number.isNaN(n) || !accept(n)) return
        onChange(integer ? Math.trunc(n) : n)
      }}
    />
  )
}
