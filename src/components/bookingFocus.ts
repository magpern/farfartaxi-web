export type BookingEditField = 'who' | 'when' | 'from' | 'to' | 'note'

/** Focus the matching input on the booking page after the sheet closed. */
export function focusBookingField(field: BookingEditField) {
  const selector =
    field === 'from'
      ? 'input[data-booking-field="from"]'
      : field === 'to'
        ? 'input[data-booking-field="to"]'
        : field === 'note'
          ? '.pickup-note-field textarea'
          : field === 'who'
            ? '.confirm-picker'
            : null
  if (!selector) return
  window.setTimeout(() => document.querySelector<HTMLElement>(selector)?.focus(), 50)
}

