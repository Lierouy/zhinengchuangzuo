import { Check, SquarePen, Trash, X } from 'lucide-react'
import { ReactNode } from 'react'

export type InlineEditTableRow = {
  key: string
  isEditing: boolean
  /** First column: the value, or the input shown while the row is edited. */
  content: ReactNode
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
}

export type InlineEditTableAddingRow = {
  content: ReactNode
  onSave: () => void
  onCancel: () => void
}

/**
 * The two-column settings table with inline editing: every row shows ✎ / 🗑,
 * the row being edited shows ✓ / ✗, and the footer button appends a new row.
 */
export function InlineEditTable({
  rows,
  adding,
  addLabel,
  onStartAdd,
}: {
  rows: InlineEditTableRow[]
  adding: InlineEditTableAddingRow | null
  addLabel: string
  onStartAdd: () => void
}) {
  return (
    <div className="zncz-settings-table-container">
      <table className="zncz-settings-table">
        <colgroup>
          <col width="90%" />
          <col width="10%" />
        </colgroup>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.content}</td>
              <td>
                <div className="zncz-settings-actions">
                  {row.isEditing ? (
                    <>
                      <button
                        onClick={row.onSaveEdit}
                        className="clickable-icon"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={row.onCancelEdit}
                        className="clickable-icon"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={row.onStartEdit}
                        className="clickable-icon"
                      >
                        <SquarePen size={16} />
                      </button>
                      <button onClick={row.onDelete} className="clickable-icon">
                        <Trash size={16} />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {adding && (
            <tr>
              <td>{adding.content}</td>
              <td>
                <div className="zncz-settings-actions">
                  <button onClick={adding.onSave} className="clickable-icon">
                    <Check size={16} />
                  </button>
                  <button onClick={adding.onCancel} className="clickable-icon">
                    <X size={16} />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <button onClick={onStartAdd} disabled={adding !== null}>
                {addLabel}
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
