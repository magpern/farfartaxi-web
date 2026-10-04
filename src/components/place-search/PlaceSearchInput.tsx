import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { recordSelection, type PlaceResult, type SearchContext } from '../../api/places'
import { track } from '../../lib/telemetry'
import { usePlaceSearch } from '../../hooks/usePlaceSearch'
import { PlaceResultList } from './PlaceResultList'
import { optionId } from './format'

type Props = {
  token: string
  value: string
  onChange: (text: string) => void
  /** Called with the chosen place and the query the user typed. */
  onSelect: (place: PlaceResult, query: string) => void
  /** ✕ pressed: the owner must also reset coordinates. */
  onClear: () => void
  context?: SearchContext
  placeholder: string
  ariaLabel: string
  clearLabel: string
  onFocus?: () => void
  /** Optional `data-booking-field` attribute (focus target for "edit" links). */
  fieldName?: string
  inputType?: 'text' | 'search'
  /** Shows a "⭐ Spara" action on each result. */
  onSave?: (place: PlaceResult) => void
}

/** Combobox with live place suggestions. Selecting records the choice for learned ranking (fire-and-forget). */
export function PlaceSearchInput({
  token,
  value,
  onChange,
  onSelect,
  onClear,
  context,
  placeholder,
  ariaLabel,
  clearLabel,
  onFocus,
  fieldName,
  inputType = 'text',
  onSave
}: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const search = usePlaceSearch({ token, query: value, enabled: open, context })
  const showList = open && search.active

  const startedRef = useRef(false)

  function pick(p: PlaceResult) {
    track('search_result_selected', {
      provider: p.provider,
      kind: p.kind,
      rank: Math.max(0, search.results.indexOf(p)),
      queryLength: value.trim().length,
      latencyMs: search.latencyMs
    })
    recordSelection(token, value.trim(), p)
    setOpen(false)
    setActiveIndex(-1)
    onSelect(p, value.trim())
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const n = search.results.length
    if (e.key === 'ArrowDown' && showList && n > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % n)
    } else if (e.key === 'ArrowUp' && showList && n > 0) {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? n - 1 : i - 1))
    } else if (e.key === 'Enter' && showList && activeIndex >= 0 && search.results[activeIndex]) {
      e.preventDefault()
      pick(search.results[activeIndex])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div
      className="place-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <div className="field-wrap">
        <input
          className="sheet-input"
          type={inputType}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showList && activeIndex >= 0 ? optionId(listId, activeIndex) : undefined}
          autoComplete="off"
          maxLength={100}
          data-booking-field={fieldName}
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onFocus={() => {
            startedRef.current = false
            onFocus?.()
          }}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setOpen(true)
            setActiveIndex(-1)
            if (!startedRef.current && e.target.value.trim().length > 0) {
              startedRef.current = true
              track('search_started', { queryLength: e.target.value.trim().length })
            }
            onChange(e.target.value)
          }}
        />
        {value && (
          <button
            type="button"
            className="field-clear"
            aria-label={clearLabel}
            onClick={() => {
              setOpen(false)
              setActiveIndex(-1)
              onClear()
            }}
          >
            ✕
          </button>
        )}
      </div>
      {showList && (
        <PlaceResultList
          id={listId}
          results={search.results}
          status={search.status}
          hasMore={search.hasMore}
          expanded={search.expanded}
          activeIndex={activeIndex}
          onPick={pick}
          onShowMore={search.showMore}
          onSave={onSave}
        />
      )}
    </div>
  )
}
