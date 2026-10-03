import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { PlaceSearchInput } from './place-search/PlaceSearchInput'

export type PickedAddress = { address: string; lat: number; lon: number }

/** Destination search for editing a ride, backed by the places search (stops, addresses, POIs). */
export function AddressSearch({
  token,
  onPick,
  onClear
}: {
  token: string
  onPick: (a: PickedAddress) => void
  onClear?: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  return (
    <div className="address-search">
      <PlaceSearchInput
        token={token}
        inputType="search"
        value={query}
        onChange={setQuery}
        onClear={() => {
          setQuery('')
          onClear?.()
        }}
        onSelect={(p) => {
          onPick({ address: p.formattedAddress, lat: p.lat, lon: p.lon })
          setQuery('')
        }}
        placeholder={t('rides.editSearchPlaceholder')}
        ariaLabel={t('rides.editSearchLabel')}
        clearLabel={t('rides.editClearDestination')}
      />
    </div>
  )
}
